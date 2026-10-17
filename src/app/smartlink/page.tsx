'use client';

import { useState } from 'react';
import { Link as LinkIcon, Plus, Trash2, ExternalLink } from 'lucide-react';

type LinkItem = { id: number; title: string; url: string };

export default function SmartLinkPage() {
  const [title, setTitle] = useState('Mi SmartLink');
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const addLink = () => {
    if (!newTitle.trim() || !newUrl.trim()) return;
    setLinks((prev) => [...prev, { id: Date.now(), title: newTitle.trim(), url: newUrl.trim() }]);
    setNewTitle('');
    setNewUrl('');
  };

  const removeLink = (id: number) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <>
      <h1 className="page-title">SmartLink</h1>
      <p className="page-subtitle">Crea tu página de enlaces (link in bio) para compartir en un solo enlace.</p>

      <div className="grid-cols-2">
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Configurar</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Título de la página</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--sidebar-bg)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Añadir enlace</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título (ej. Mi web)"
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--sidebar-bg)',
                color: 'var(--text-primary)',
              }}
            />
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://..."
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--sidebar-bg)',
                color: 'var(--text-primary)',
              }}
            />
            <button className="btn btn-primary" onClick={addLink} disabled={!newTitle.trim() || !newUrl.trim()}>
              <Plus size={16} /> Añadir
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {links.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <LinkIcon size={16} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</span>
                </div>
                <button onClick={() => removeLink(l.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {links.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Aún no has añadido enlaces.</p>
            )}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Vista previa</h2>
          <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'var(--primary-color)', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1.5rem' }}>
              {title.charAt(0).toUpperCase() || 'M'}
            </div>
            <div style={{ fontWeight: 600, marginBottom: '1.5rem' }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--card-hover)',
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  <ExternalLink size={14} /> {l.title}
                </a>
              ))}
              {links.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Tus enlaces aparecerán aquí.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
