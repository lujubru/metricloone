'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { CheckCircle2, MoreVertical, Plus, X, Loader2 } from 'lucide-react';
import type { FacebookPage, SocialProfile } from '@/lib/types';

export default function ConnectionsPage() {
  const { data: session } = useSession();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectedProfiles, setConnectedProfiles] = useState<SocialProfile[]>([]);

  useEffect(() => {
    // Cargar los perfiles que están conectados en la base de datos real
    const loadProfiles = async () => {
      if (session) {
        const res = await fetch('/api/profiles');
        if (res.ok) {
          const data = await res.json();
          setConnectedProfiles(data.profiles || []);
        }
      }
    };
    loadProfiles();
  }, [session]);

  const fetchFacebookPages = async () => {
    setLoadingPages(true);
    setIsModalOpen(true);
    try {
      const res = await fetch('/api/facebook/pages');
      if (res.ok) {
        const data = await res.json();
        setPages(data.pages || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPages(false);
    }
  };

  const handleTogglePage = (id: string) => {
    setSelectedPages(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const saveSelectedPages = async () => {
    setSaving(true);
    const selectedData = pages.filter(p => selectedPages.includes(p.id));
    
    try {
      const res = await fetch('/api/facebook/save-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedPages: selectedData })
      });
      
      if (res.ok) {
        // Recargar los perfiles reales desde la BD
        const profRes = await fetch('/api/profiles');
        const data = await profRes.json();
        setConnectedProfiles(data.profiles || []);
        
        setIsModalOpen(false);
        setSelectedPages([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const networkCards = [
    {
      id: 'facebook',
      name: 'Facebook',
      color: '#1877F2',
      icon: <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>,
      action: session ? fetchFacebookPages : () => signIn("facebook")
    },
    {
      id: 'instagram',
      name: 'Instagram',
      color: '#E1306C',
      icon: <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>,
      action: () => {}
    }
  ];

  const getPlatformColor = (platform: string) => {
    if (platform === 'facebook_page') return '#1877F2';
    return '#333';
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Connections</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Conecta tus perfiles sociales para comenzar a administrarlos.</p>
        </div>
      </div>

      {connectedProfiles.length > 0 && (
        <>
          <h2 style={{fontSize: '1.2rem', marginBottom: '1rem'}}>Perfiles Conectados</h2>
          <div className="grid-cols-3" style={{marginBottom: '3rem'}}>
            {connectedProfiles.map((network) => (
              <div key={network.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', overflow: 'hidden', border: '1px solid #10b981' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ 
                    width: '48px', height: '48px', borderRadius: '12px', 
                    background: `linear-gradient(135deg, ${getPlatformColor(network.platform)} 0%, rgba(0,0,0,0.8) 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                  }}>
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <MoreVertical size={20} />
                  </button>
                </div>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.25rem' }}>{network.platform === 'facebook_page' ? 'Facebook Page' : network.platform}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#10b981' }}>
                    <CheckCircle2 size={16} /> <span>Conectado como <strong style={{ color: 'var(--text-primary)'}}>{network.username}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 style={{fontSize: '1.2rem', marginBottom: '1rem'}}>Redes Disponibles</h2>
      <div className="grid-cols-3">
        {networkCards.map((network) => (
          <div key={network.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '100px', height: '100px', background: network.color, opacity: 0.15, filter: 'blur(40px)', borderRadius: '50%'}}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `linear-gradient(135deg, ${network.color} 0%, rgba(0,0,0,0.8) 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'}}>
                {network.icon}
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.25rem' }}>{network.name}</h3>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Haz clic para importar perfiles</div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <button onClick={network.action} className="btn btn-primary" style={{ width: '100%', backgroundColor: network.color, boxShadow: `0 4px 14px 0 ${network.color}40` }}>
                <Plus size={18} /> Conectar Maestros
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div style={{ backgroundColor: 'var(--card-bg)', width: '100%', maxWidth: '500px', borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: 'var(--shadow-lg)'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Selecciona Páginas a Importar</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}><X size={24} /></button>
            </div>

            {loadingPages ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', color: 'var(--text-secondary)'}}>
                <Loader2 size={32} className="animate-spin" style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem', color: 'var(--primary-color)'}} />
                <p>Consultando a Facebook...</p>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  Hemos detectado las siguientes páginas asociadas a tu cuenta. Marca aquellas que deseas administrar desde esta plataforma.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                  {pages.map((page) => (
                    <label key={page.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius-md)', cursor: 'pointer', border: selectedPages.includes(page.id) ? '1px solid var(--primary-color)' : '1px solid var(--border-color)'}}>
                      <input 
                        type="checkbox" 
                        checked={selectedPages.includes(page.id)}
                        onChange={() => handleTogglePage(page.id)}
                        style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--primary-color)' }}
                      />
                      <div>
                        <div style={{ fontWeight: 500 }}>{page.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)'}}>{page.category || 'Página de Facebook'}</div>
                      </div>
                    </label>
                  ))}
                  {pages.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No se encontraron páginas administradas o debes iniciar sesión.</div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                  <button 
                    onClick={saveSelectedPages} 
                    className="btn btn-primary" 
                    style={{ flex: 1 }}
                    disabled={selectedPages.length === 0 || saving}
                  >
                    {saving ? 'Guardando...' : `Importar (${selectedPages.length}) Páginas`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </>
  );
}
