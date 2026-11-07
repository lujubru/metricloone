'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { CheckCircle2, MoreVertical, Plus, X, Loader2 } from 'lucide-react';
import type { FacebookPage, SocialProfile, InstagramAccountItem } from '@/lib/types';

export default function ConnectionsPage() {
  const { data: session } = useSession();
  
  const [modalType, setModalType] = useState<'facebook' | 'instagram' | null>(null);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesError, setPagesError] = useState('');
  const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccountItem[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState('');
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

  useEffect(() => {
    if (!modalType) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalType(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalType]);

  const fetchFacebookPages = async () => {
    setLoadingPages(true);
    setPagesError('');
    setSelectedPages([]);
    setModalType('facebook');
    try {
      const res = await fetch('/api/facebook/pages');
      const data = await res.json();
      if (res.ok) {
        setPages(data.pages || []);
      } else {
        setPages([]);
        setPagesError(data.error || 'No se pudieron obtener las páginas de Facebook.');
      }
    } catch (e) {
      console.error(e);
      setPagesError('Error de red al consultar Facebook.');
    } finally {
      setLoadingPages(false);
    }
  };

  const fetchInstagramAccounts = async () => {
    setLoadingAccounts(true);
    setAccountsError('');
    setSelectedAccounts([]);
    setModalType('instagram');
    try {
      const res = await fetch('/api/instagram/accounts');
      const data = await res.json();
      if (res.ok) {
        setInstagramAccounts(data.accounts || []);
      } else {
        setInstagramAccounts([]);
        setAccountsError(
          data.error || 'No se pudieron obtener las cuentas de Instagram.'
        );
      }
    } catch (e) {
      console.error(e);
      setAccountsError('Error de red al consultar Instagram.');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const reloadProfiles = async () => {
    const profRes = await fetch('/api/profiles');
    const data = await profRes.json();
    setConnectedProfiles(data.profiles || []);
  };

  const handleTogglePage = (id: string) => {
    setSelectedPages(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleToggleAccount = (id: string) => {
    setSelectedAccounts(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
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
        await reloadProfiles();
        setModalType(null);
        setSelectedPages([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedAccounts = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/instagram/save-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAccounts })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        await reloadProfiles();
        setModalType(null);
        setSelectedAccounts([]);
      } else {
        setAccountsError(data.error || 'No se pudieron guardar las cuentas de Instagram.');
      }
    } catch (e) {
      console.error(e);
      setAccountsError('Error de red al guardar las cuentas de Instagram.');
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
      action: session ? fetchInstagramAccounts : () => signIn("facebook")
    }
  ];

  const getPlatformColor = (platform: string) => {
    if (platform === 'facebook_page') return '#1877F2';
    if (platform === 'instagram_business') return '#E1306C';
    return '#333';
  };

  const getPlatformLabel = (platform: string) => {
    if (platform === 'facebook_page') return 'Facebook Page';
    if (platform === 'instagram_business') return 'Instagram';
    return platform;
  };

  const getPlatformIcon = (platform: string) => {
    if (platform === 'instagram_business') {
      return <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>;
    }
    if (platform === 'facebook_page') {
      return <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>;
    }
    return null;
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
                    {getPlatformIcon(network.platform)}
                  </div>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <MoreVertical size={20} />
                  </button>
                </div>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.25rem' }}>{getPlatformLabel(network.platform)}</h3>
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

      {modalType === 'facebook' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Selecciona Páginas a Importar"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', overflowY: 'auto', overscrollBehavior: 'contain', padding: '1.5rem 1rem', backdropFilter: 'blur(4px)'}}
          onClick={() => setModalType(null)}
        >
          <div
            style={{ margin: 'auto', backgroundColor: 'var(--card-bg)', width: '100%', maxWidth: '500px', borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: 'var(--shadow-lg)'}}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Selecciona Páginas a Importar</h2>
              <button onClick={() => setModalType(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}><X size={24} /></button>
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
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: pagesError ? '#ef4444' : 'var(--text-secondary)' }}>
                      {pagesError || 'No se encontraron páginas administradas. Verificá que tu cuenta tenga permisos de administrador sobre alguna Página y que hayas aceptado el permiso pages_show_list.'}
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => setModalType(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
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

      {modalType === 'instagram' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Selecciona Cuentas de Instagram a Importar"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', overflowY: 'auto', overscrollBehavior: 'contain', padding: '1.5rem 1rem', backdropFilter: 'blur(4px)'}}
          onClick={() => setModalType(null)}
        >
          <div
            style={{ margin: 'auto', backgroundColor: 'var(--card-bg)', width: '100%', maxWidth: '500px', borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: 'var(--shadow-lg)'}}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Selecciona Cuentas de Instagram</h2>
              <button onClick={() => setModalType(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}><X size={24} /></button>
            </div>

            {loadingAccounts ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', color: 'var(--text-secondary)'}}>
                <Loader2 size={32} style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem', color: '#E1306C'}} />
                <p>Buscando cuentas de Instagram...</p>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  Detectamos las cuentas de Instagram Business o Creator vinculadas a tus Páginas de Facebook. Marca las que quieras administrar desde aquí.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                  {instagramAccounts.map((account) => (
                    <label key={account.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', backgroundColor: 'var(--sidebar-bg)', borderRadius: 'var(--radius-md)', cursor: 'pointer', border: selectedAccounts.includes(account.id) ? '1px solid #E1306C' : '1px solid var(--border-color)'}}>
                      <input
                        type="checkbox"
                        checked={selectedAccounts.includes(account.id)}
                        onChange={() => handleToggleAccount(account.id)}
                        style={{ width: '1.2rem', height: '1.2rem', accentColor: '#E1306C' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        {account.profilePictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={account.profilePictureUrl}
                            alt={account.username}
                            width={36}
                            height={36}
                            style={{ borderRadius: '50%', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#E1306C', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>@{account.username}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                            {account.followersCount !== null ? `${account.followersCount.toLocaleString('es-AR')} seguidores · ` : ''}
                            Página: {account.pageName}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                  {instagramAccounts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: accountsError ? '#ef4444' : 'var(--text-secondary)' }}>
                      {accountsError ||
                        'No encontramos cuentas de Instagram vinculadas. Verificá que tu Instagram sea Business o Creator y esté conectado a una Página de Facebook que administres, y que hayas aceptado los permisos instagram_basic e instagram_content_publish (puede requerir volver a iniciar sesión).'}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => setModalType(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                  <button
                    onClick={saveSelectedAccounts}
                    className="btn btn-primary"
                    style={{ flex: 1, backgroundColor: '#E1306C', boxShadow: '0 4px 14px 0 #E1306C40' }}
                    disabled={selectedAccounts.length === 0 || saving}
                  >
                    {saving ? 'Guardando...' : `Importar (${selectedAccounts.length}) Cuentas`}
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
