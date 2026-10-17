'use client';

import { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import type { SocialProfile } from '@/lib/types';

type NewPostModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function NewPostForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [content, setContent] = useState('');
  const [socialProfileId, setSocialProfileId] = useState('');
  const [scheduledFor, setScheduledFor] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [mediaUrls, setMediaUrls] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    fetch('/api/profiles')
      .then((res) => res.json())
      .then((data) => {
        if (ignore) return;
        setProfiles(data.profiles || []);
        if (data.profiles && data.profiles.length > 0) {
          setSocialProfileId(data.profiles[0].id);
        }
      })
      .catch(() => {
        if (!ignore) setError('No se pudieron cargar los perfiles.');
      })
      .finally(() => {
        if (!ignore) setLoadingProfiles(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const urlList = mediaUrls
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          socialProfileId,
          scheduledFor: new Date(scheduledFor).toISOString(),
          mediaUrls: urlList,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'No se pudo crear el post.');
      } else {
        setContent('');
        setMediaUrls('');
        onCreated();
        onClose();
      }
    } catch {
      setError('Error de red al crear el post.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Nuevo Post</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Perfil</label>
          {loadingProfiles ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
              <Loader2 size={16} style={{ animation: 'spin 2s linear infinite' }} /> Cargando perfiles...
            </div>
          ) : (
            <select
              value={socialProfileId}
              onChange={(e) => setSocialProfileId(e.target.value)}
              required
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--sidebar-bg)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="" disabled>Selecciona un perfil</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username || p.profileId} ({p.platform})
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Contenido</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={5}
            placeholder="Escribe el contenido de tu publicación..."
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--sidebar-bg)',
              color: 'var(--text-primary)',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Fecha y hora de publicación</label>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            required
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--sidebar-bg)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>URLs de medios (opcional, separadas por coma)</label>
          <input
            type="text"
            value={mediaUrls}
            onChange={(e) => setMediaUrls(e.target.value)}
            placeholder="https://..."
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--sidebar-bg)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving || loadingProfiles || !socialProfileId}>
            {saving ? 'Guardando...' : 'Programar Post'}
          </button>
        </div>
      </form>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      ` }} />
    </>
  );
}

export default function NewPostModal({ open, onClose, onCreated }: NewPostModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          width: '100%',
          maxWidth: '520px',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <NewPostForm onClose={onClose} onCreated={onCreated} />
      </div>
    </div>
  );
}
