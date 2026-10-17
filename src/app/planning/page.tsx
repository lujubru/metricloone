'use client';

import { useState, useEffect } from 'react';
import { Clock, Plus, Filter, Trash2, Loader2 } from 'lucide-react';
import NewPostModal from '@/components/NewPostModal';
import type { Post } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Planning() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
    return () => window.removeEventListener('posts-updated', refresh);
  }, []);

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
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Clock size={14} /> {formatDate(p.scheduledFor)}
                    </span>
                    <span>{p.socialProfile?.username || p.socialProfile?.profileId || p.socialProfileId}</span>
                    <span style={{ color: 'var(--primary-color)' }}>{p.status}</span>
                  </div>
                </div>
                <button
                  onClick={() => deletePost(p.id)}
                  disabled={deletingId === p.id}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                  title="Eliminar post"
                >
                  {deletingId === p.id ? <Loader2 size={18} style={{ animation: 'spin 2s linear infinite' }} /> : <Trash2 size={18} />}
                </button>
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
