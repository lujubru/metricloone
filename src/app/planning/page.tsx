'use client';

import { useState, useEffect } from 'react';
import { Clock, Plus, Filter, Trash2, Loader2, Send, RotateCcw, AlertCircle } from 'lucide-react';
import NewPostModal from '@/components/NewPostModal';
import type { Post } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

export default function Planning() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }).map((_, i) => {
    const dayNum = i - firstWeekday + 1;
    return dayNum > 0 && dayNum <= daysInMonth ? dayNum : null;
  });

  const postsByDay = new Map<string, Post[]>();
  posts.forEach((p) => {
    const key = new Date(p.scheduledFor).toISOString().slice(0, 10);
    if (!postsByDay.has(key)) postsByDay.set(key, []);
    postsByDay.get(key)!.push(p);
  });

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Planning</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Programa y administra tu contenido.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary">
            <Filter size={16} /> Filter
          </button>
          <button className="btn btn-primary" onClick={() => setIsNewPostOpen(true)}>
            <Plus size={16} /> Create Post
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '1.125rem', textTransform: 'capitalize' }}>{monthName}</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem' }}>Day</button>
            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem' }}>Week</button>
            <button className="btn btn-primary" style={{ padding: '0.25rem 0.75rem' }}>Month</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: 'var(--border-color)', gap: '1px' }}>
          {WEEKDAYS.map((day) => (
            <div key={day} style={{ padding: '0.75rem', backgroundColor: 'var(--card-bg)', textAlign: 'center', fontWeight: 500, fontSize: '0.875rem' }}>
              {day}
            </div>
          ))}

          {cells.map((dayNum, i) => {
            const isoDate = dayNum ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : '';
            const dayPosts = dayNum ? postsByDay.get(isoDate) || [] : [];

            return (
              <div key={i} style={{
                minHeight: '120px',
                backgroundColor: 'var(--card-bg)',
                padding: '0.5rem',
                color: dayNum ? 'var(--text-primary)' : 'transparent',
              }}>
                <div style={{ textAlign: 'right', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  {dayNum}
                </div>
                {dayPosts.slice(0, 3).map((p) => (
                  <div key={p.id} style={{
                    fontSize: '0.7rem',
                    padding: '0.25rem 0.4rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    color: 'var(--primary-color)',
                    marginBottom: '0.25rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {p.content}
                  </div>
                ))}
                {dayPosts.length > 3 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>+{dayPosts.length - 3} más</div>
                )}
              </div>
            );
          })}
        </div>
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
        ) : posts.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No tienes posts programados. Crea uno para comenzar.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {posts.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.75rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{p.content}</div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Clock size={14} /> {formatDate(p.scheduledFor)}
                    </span>
                    <span>{p.socialProfile?.username || p.socialProfile?.profileId || p.socialProfileId}</span>
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
