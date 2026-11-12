'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Film as FilmIcon,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import NewPostModal from '@/components/NewPostModal';
import { POST_TYPE_STORY, isVideoUrl } from '@/lib/media';
import type { Post } from '@/lib/types';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SCHEDULED: 'Programado',
  PUBLISHING: 'Publicando',
  PUBLISHED: 'Publicado',
  FAILED: 'Fallido',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  SCHEDULED: '#3b82f6',
  PUBLISHING: '#f59e0b',
  PUBLISHED: '#10b981',
  FAILED: '#ef4444',
};

type ViewMode = 'month' | 'week' | 'day';

type Filters = {
  profileId: string;
  status: string;
  postType: string;
};

const EMPTY_FILTERS: Filters = { profileId: 'all', status: 'all', postType: 'all' };

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--sidebar-bg)',
  color: 'var(--text-primary)',
};

const navButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--card-bg)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

const dayHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.6rem 0.75rem',
  borderBottom: '1px solid var(--border-color)',
  fontSize: '0.875rem',
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Lunes como primer día de la semana. */
function startOfWeek(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** Clave local `YYYY-MM-DD` (usar ISO/UTC desplaza el día en husos negativos). */
function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function profileLabel(post: Post) {
  return post.socialProfile?.username || post.socialProfile?.profileId || post.socialProfileId;
}

function viewLabel(view: ViewMode, cursor: Date) {
  if (view === 'month') {
    return cursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }

  if (view === 'week') {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    const startLabel = start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const endLabel = end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startLabel} – ${endLabel}`;
  }

  return cursor.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Planning() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    let ignore = false;

    fetch('/api/posts')
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setPosts(data.posts || []);
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    const refresh = () => setRefreshKey((k) => k + 1);
    window.addEventListener('posts-updated', refresh);
    // Refresca para reflejar lo que publique el scheduler en segundo plano.
    const interval = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('posts-updated', refresh);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isFilterOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFilterOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFilterOpen]);

  const publishPost = async (id: string) => {
    setPublishingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/posts/${id}/publish`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setActionError(data.error || 'No se pudo publicar el post');
    } catch (e) {
      console.error(e);
      setActionError('No se pudo publicar el post');
    } finally {
      setPublishingId(null);
      setRefreshKey((k) => k + 1);
    }
  };

  const deletePost = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  const today = startOfDay(new Date());

  const activeFilterCount =
    (filters.profileId !== 'all' ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0) +
    (filters.postType !== 'all' ? 1 : 0);

  const filteredPosts = posts
    .filter((p) => {
      if (filters.profileId !== 'all' && p.socialProfileId !== filters.profileId) return false;
      if (filters.status !== 'all' && (p.status || '').toUpperCase() !== filters.status) return false;
      if (filters.postType !== 'all') {
        const type = p.postType === POST_TYPE_STORY ? POST_TYPE_STORY : 'POST';
        if (type !== filters.postType) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

  const postsByDay = new Map<string, Post[]>();
  filteredPosts.forEach((p) => {
    const key = dateKey(new Date(p.scheduledFor));
    postsByDay.set(key, [...(postsByDay.get(key) || []), p]);
  });

  const profileOptions = Array.from(
    new Map(
      posts.map((p) => [p.socialProfileId, { id: p.socialProfileId, label: profileLabel(p) }])
    ).values()
  );

  const shift = (direction: number) => {
    if (view === 'month') setCursor((prev) => addMonths(prev, direction));
    else if (view === 'week') setCursor((prev) => addDays(prev, direction * 7));
    else setCursor((prev) => addDays(prev, direction));
  };

  const goToDay = (date: Date) => {
    setCursor(startOfDay(date));
    setView('day');
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Planning</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Programa y administra tu contenido.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-secondary"
              aria-expanded={isFilterOpen}
              onClick={() => setIsFilterOpen((open) => !open)}
            >
              <Filter size={16} /> Filtros
              {activeFilterCount > 0 && (
                <span style={{
                  minWidth: '18px',
                  height: '18px',
                  borderRadius: '999px',
                  backgroundColor: 'var(--primary-color)',
                  color: 'white',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 0.3rem',
                }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {isFilterOpen && (
              <>
                <div
                  onClick={() => setIsFilterOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 30 }}
                />
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 0.5rem)',
                  right: 0,
                  zIndex: 31,
                  width: '280px',
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}>
                  <FilterField label="Cuenta">
                    <select
                      value={filters.profileId}
                      onChange={(e) => setFilters((prev) => ({ ...prev, profileId: e.target.value }))}
                      style={selectStyle}
                    >
                      <option value="all">Todas las cuentas</option>
                      {profileOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </FilterField>

                  <FilterField label="Tipo">
                    <select
                      value={filters.postType}
                      onChange={(e) => setFilters((prev) => ({ ...prev, postType: e.target.value }))}
                      style={selectStyle}
                    >
                      <option value="all">Publicaciones e historias</option>
                      <option value="POST">Publicaciones</option>
                      <option value="STORY">Historias</option>
                    </select>
                  </FilterField>

                  <FilterField label="Estado">
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                      style={selectStyle}
                    >
                      <option value="all">Todos los estados</option>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </FilterField>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ justifyContent: 'center' }}
                    disabled={activeFilterCount === 0}
                    onClick={() => setFilters(EMPTY_FILTERS)}
                  >
                    Limpiar filtros
                  </button>
                </div>
              </>
            )}
          </div>

          <button type="button" className="btn btn-primary" onClick={() => setIsNewPostOpen(true)}>
            <Plus size={16} /> Nuevo post
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => shift(-1)} title="Anterior" style={navButtonStyle}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => shift(1)} title="Siguiente" style={navButtonStyle}>
              <ChevronRight size={18} />
            </button>
            <div style={{ fontWeight: 600, fontSize: '1.125rem', textTransform: 'capitalize' }}>
              {viewLabel(view, cursor)}
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
              onClick={() => setCursor(startOfDay(new Date()))}
            >
              Hoy
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={view === mode ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ padding: '0.25rem 0.75rem' }}
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
              >
                {mode === 'day' ? 'Día' : mode === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={18} style={{ animation: 'spin 2s linear infinite' }} /> Cargando posts...
          </div>
        ) : view === 'month' ? (
          <MonthGrid
            cursor={cursor}
            today={today}
            postsByDay={postsByDay}
            onSelectDay={goToDay}
          />
        ) : view === 'week' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', backgroundColor: 'var(--border-color)', gap: '1px' }}>
            {Array.from({ length: 7 }).map((_, index) => {
              const date = addDays(startOfWeek(cursor), index);
              const dayPosts = postsByDay.get(dateKey(date)) || [];

              return (
                <div key={dateKey(date)} style={{ backgroundColor: 'var(--card-bg)' }}>
                  <div style={dayHeaderStyle}>
                    <span style={{ fontWeight: 500 }}>{WEEKDAYS[index]}</span>
                    <span style={{
                      fontWeight: isSameDay(date, today) ? 700 : 500,
                      color: isSameDay(date, today) ? 'var(--primary-color)' : 'var(--text-primary)',
                    }}>
                      {date.getDate()}
                    </span>
                  </div>
                  <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', minHeight: '160px' }}>
                    {dayPosts.map((p) => (
                      <PostChip key={p.id} post={p} showTime />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <div style={dayHeaderStyle}>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                {cursor.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                {(postsByDay.get(dateKey(cursor)) || []).length} publicaciones
              </span>
            </div>
            <DayAgenda posts={postsByDay.get(dateKey(cursor)) || []} />
          </div>
        )}

        {!loading && posts.length > 0 && filteredPosts.length === 0 && (
          <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Ningún post coincide con los filtros activos.{' '}
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: 0, font: 'inherit' }}
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Próximos Posts</h2>
        {actionError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.85rem' }}>
            <AlertCircle size={16} /> {actionError}
          </div>
        )}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={18} style={{ animation: 'spin 2s linear infinite' }} /> Cargando posts...
          </div>
        ) : filteredPosts.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            {posts.length === 0
              ? 'No tienes posts programados. Crea uno para comenzar.'
              : 'Ningún post coincide con los filtros activos.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredPosts.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.75rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                    {p.content || (p.postType === POST_TYPE_STORY ? 'Historia sin texto' : '(sin contenido)')}
                  </div>
                  <MediaThumbnails urls={p.mediaUrls || []} />
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Clock size={14} /> {formatDate(p.scheduledFor)}
                    </span>
                    <span>{profileLabel(p)}</span>
                    <TypeBadge post={p} />
                    <StatusBadge status={p.status} />
                    {p.status === 'PUBLISHED' && p.publishedAt && (
                      <span>Publicado el {formatDate(p.publishedAt)}</span>
                    )}
                  </div>
                  {p.errorMessage && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.78rem', color: '#ef4444' }}>
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                      <span>{p.errorMessage}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {p.status !== 'PUBLISHED' && p.status !== 'PUBLISHING' && (
                    <button
                      type="button"
                      onClick={() => publishPost(p.id)}
                      disabled={publishingId === p.id}
                      style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '0.25rem' }}
                      title={p.status === 'FAILED' ? 'Reintentar publicación' : 'Publicar ahora'}
                    >
                      {publishingId === p.id ? (
                        <Loader2 size={18} style={{ animation: 'spin 2s linear infinite' }} />
                      ) : p.status === 'FAILED' ? (
                        <RotateCcw size={18} />
                      ) : (
                        <Send size={18} />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deletePost(p.id)}
                    disabled={deletingId === p.id}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                    title="Eliminar post"
                  >
                    {deletingId === p.id ? <Loader2 size={18} style={{ animation: 'spin 2s linear infinite' }} /> : <Trash2 size={18} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NewPostModal
        open={isNewPostOpen}
        onClose={() => setIsNewPostOpen(false)}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      ` }} />
    </>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function MonthGrid({
  cursor,
  today,
  postsByDay,
  onSelectDay,
}: {
  cursor: Date;
  today: Date;
  postsByDay: Map<string, Post[]>;
  onSelectDay: (date: Date) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }).map((_, index) => {
    const dayNum = index - firstWeekday + 1;
    return dayNum > 0 && dayNum <= daysInMonth ? dayNum : null;
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', backgroundColor: 'var(--border-color)', gap: '1px' }}>
      {WEEKDAYS.map((day) => (
        <div key={day} style={{ padding: '0.75rem', backgroundColor: 'var(--card-bg)', textAlign: 'center', fontWeight: 500, fontSize: '0.875rem' }}>
          {day}
        </div>
      ))}

      {cells.map((dayNum, index) => {
        const date = dayNum ? new Date(year, month, dayNum) : null;
        const dayPosts = date ? postsByDay.get(dateKey(date)) || [] : [];
        const isToday = date ? isSameDay(date, today) : false;

        return (
          <div
            key={index}
            style={{
              minHeight: '120px',
              backgroundColor: 'var(--card-bg)',
              padding: '0.5rem',
              color: dayNum ? 'var(--text-primary)' : 'transparent',
            }}
          >
            {date && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => onSelectDay(date)}
                  title={`Ver el ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`}
                  style={{
                    background: isToday ? 'var(--primary-color)' : 'transparent',
                    border: 'none',
                    borderRadius: '999px',
                    width: '26px',
                    height: '26px',
                    cursor: 'pointer',
                    color: isToday ? 'white' : 'inherit',
                    fontWeight: isToday ? 700 : 400,
                    fontSize: '0.875rem',
                  }}
                >
                  {dayNum}
                </button>
              </div>
            )}

            {dayPosts.slice(0, 3).map((p) => (
              <PostChip key={p.id} post={p} />
            ))}

            {dayPosts.length > 3 && (
              <button
                type="button"
                onClick={() => date && onSelectDay(date)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}
              >
                +{dayPosts.length - 3} más
              </button>
            )}

          </div>
        );
      })}
    </div>
  );
}

function PostChip({ post, showTime }: { post: Post; showTime?: boolean }) {
  const isStory = post.postType === POST_TYPE_STORY;

  return (
    <div
      title={post.content || (isStory ? 'Historia sin texto' : 'Sin contenido')}
      style={{
        fontSize: '0.7rem',
        padding: '0.25rem 0.4rem',
        borderRadius: '4px',
        backgroundColor: isStory ? 'rgba(236, 72, 153, 0.15)' : 'rgba(59, 130, 246, 0.15)',
        color: isStory ? '#ec4899' : 'var(--primary-color)',
        marginBottom: '0.25rem',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {showTime && <span style={{ opacity: 0.85, marginRight: '0.3rem' }}>{formatTime(post.scheduledFor)}</span>}
      {isStory ? `Historia${post.content ? ` · ${post.content}` : ''}` : post.content || '(sin contenido)'}
    </div>
  );
}

function DayAgenda({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', padding: '1.5rem' }}>
        No hay publicaciones para este día.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem 1.5rem' }}>
      {posts.map((p) => (
        <div
          key={p.id}
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
            padding: '0.75rem',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--sidebar-bg)',
          }}
        >
          <div style={{ minWidth: '52px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {formatTime(p.scheduledFor)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
              {p.content || (p.postType === POST_TYPE_STORY ? 'Historia sin texto' : '(sin contenido)')}
            </div>
            <MediaThumbnails urls={p.mediaUrls || []} />
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <span>{profileLabel(p)}</span>
              <TypeBadge post={p} />
              <StatusBadge status={p.status} />
            </div>
            {p.errorMessage && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem', marginTop: '0.35rem', fontSize: '0.75rem', color: '#ef4444' }}>
                <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <span>{p.errorMessage}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TypeBadge({ post }: { post: Post }) {
  const isStory = post.postType === POST_TYPE_STORY;

  return (
    <span style={{
      color: isStory ? '#ec4899' : 'var(--text-secondary)',
      border: `1px solid ${isStory ? '#ec489955' : 'var(--border-color)'}`,
      backgroundColor: isStory ? 'rgba(236, 72, 153, 0.12)' : 'transparent',
      borderRadius: '999px',
      padding: '0.05rem 0.5rem',
      fontSize: '0.7rem',
      fontWeight: 600,
    }}>
      {isStory ? 'Historia' : 'Publicación'}
    </span>
  );
}

function MediaThumbnails({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  const visible = urls.slice(0, 6);
  const hidden = urls.length - visible.length;

  return (
    <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {visible.map((url) =>
        isVideoUrl(url) ? (
          <div
            key={url}
            title="Video"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '6px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <FilmIcon size={18} />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt=""
            style={{
              width: '44px',
              height: '44px',
              objectFit: 'cover',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              display: 'block',
            }}
          />
        )
      )}
      {hidden > 0 && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>+{hidden}</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const key = (status || '').toUpperCase();
  const color = STATUS_COLORS[key] || 'var(--text-secondary)';

  return (
    <span style={{
      color,
      backgroundColor: `${color}1f`,
      border: `1px solid ${color}55`,
      borderRadius: '999px',
      padding: '0.05rem 0.5rem',
      fontSize: '0.7rem',
      fontWeight: 600,
    }}>
      {STATUS_LABELS[key] || status}
    </span>
  );
}
