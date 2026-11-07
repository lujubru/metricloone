'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { LogOut, Trash2, Loader2, User } from 'lucide-react';
import type { SocialProfile } from '@/lib/types';

export default function Settings() {
  const { data: session, status } = useSession();
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      fetch('/api/profiles')
        .then((res) => res.json())
        .then((data) => setProfiles(data.profiles || []))
        .catch(() => {});
    }
  }, [session]);

  const disconnect = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  if (status === 'loading') {
    return <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p>;
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Administra tu cuenta y tus perfiles conectados.</p>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Cuenta</h2>
        {session?.user ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'var(--card-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                ) : (
                  <User size={22} />
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{session.user.name || 'Usuario'}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{session.user.email || 'Sin email'}</div>
              </div>
            </div>
            <button className="btn btn-secondary" onClick={() => signOut()}>
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>No has iniciado sesión.</p>
            <Link className="btn btn-primary" href="/login">
              Iniciar sesión
            </Link>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Perfiles Conectados</h2>
        {profiles.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No tienes perfiles conectados. Ve a Connections para conectar uno.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {profiles.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.username || p.profileId}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.platform}</div>
                </div>
                <button
                  onClick={() => disconnect(p.id)}
                  disabled={deletingId === p.id}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                  title="Desconectar perfil"
                >
                  {deletingId === p.id ? <Loader2 size={18} style={{ animation: 'spin 2s linear infinite' }} /> : <Trash2 size={18} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      ` }} />
    </>
  );
}
