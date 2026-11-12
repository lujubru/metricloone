'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Settings2,
  X,
} from 'lucide-react';
import type { InboxSetup, InboxThreadDetail, InboxThreadSummary } from '@/lib/types';

const SPIN = { animation: 'spin 2s linear infinite' } as const;

const PLATFORM_LABELS: Record<string, string> = {
  facebook_page: 'Facebook',
  instagram_business: 'Instagram',
};

const KIND_LABELS: Record<string, string> = {
  COMMENT: 'Comentario',
  MESSAGE: 'Mensaje',
};

const SELECT_STYLE = {
  padding: '0.5rem 0.6rem',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--sidebar-bg)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-md)',
} as const;

function platformLabel(platform: string) {
  return PLATFORM_LABELS[platform] ?? platform;
}

const IG_USERNAME = /^[A-Za-z0-9._]{1,30}$/;

/**
 * Enlace para responder en la red social. En los comentarios alcanza con el
 * permalink de la publicación; los mensajes directos no tienen URL propia, así
 * que se usa el id del contacto en Facebook y el usuario en Instagram (el IGSID
 * no sirve como URL).
 */
function replyLink(thread: InboxThreadDetail): { href: string; label: string } {
  const platform = platformLabel(thread.platform);
  const label = `Abrir en ${platform}`;

  if (thread.kind === 'MESSAGE') {
    if (thread.platform === 'facebook_page') {
      return {
        href: thread.participantExternalId
          ? `https://www.facebook.com/messages/t/${encodeURIComponent(thread.participantExternalId)}`
          : 'https://business.facebook.com/latest/inbox/all',
        label,
      };
    }

    const username = (thread.participantName ?? '').trim().replace(/^@/, '');
    return {
      href: IG_USERNAME.test(username)
        ? `https://ig.me/m/${encodeURIComponent(username)}`
        : 'https://www.instagram.com/direct/inbox/',
      label,
    };
  }

  if (thread.permalink) return { href: thread.permalink, label };

  return {
    href:
      thread.platform === 'instagram_business'
        ? `https://www.instagram.com/${encodeURIComponent(thread.account)}`
        : `https://www.facebook.com/${encodeURIComponent(thread.account)}`,
    label,
  };
}

function initials(value: string | null) {
  const source = (value ?? '').trim();
  return source ? source.slice(0, 2).toUpperCase() : '?';
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

type Banner = { type: 'success' | 'error' | 'info'; message: string };

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThreadSummary[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);

  const [platform, setPlatform] = useState('');
  const [kind, setKind] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboxThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showSetup, setShowSetup] = useState(false);
  const [setup, setSetup] = useState<InboxSetup | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (platform) params.set('platform', platform);
      if (kind) params.set('kind', kind);
      if (unreadOnly) params.set('unread', '1');

      const res = await fetch(`/api/inbox?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo cargar la bandeja de entrada');

      setThreads(data.threads ?? []);
      setUnreadTotal(data.unreadTotal ?? 0);
    } catch (cause) {
      setBanner({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'No se pudo cargar la bandeja de entrada',
      });
    } finally {
      setLoading(false);
    }
  }, [platform, kind, unreadOnly]);

  useEffect(() => {
    // El fetch arranca en un microtask: `loadThreads` marca `loading` al inicio
    // y el linter de hooks prohíbe setState dentro del cuerpo del efecto.
    queueMicrotask(() => {
      void loadThreads();
    });
  }, [loadThreads]);

  const openThread = async (thread: InboxThreadSummary) => {
    setSelectedId(thread.id);
    setDetail(null);
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/inbox/${thread.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo abrir la conversación');
      setDetail(data.thread);

      // Abrir una conversación con mensajes sin leer la marca como leída.
      if (thread.unread > 0) {
        await fetch(`/api/inbox/${thread.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        });
        setThreads((prev) => prev.map((item) => (item.id === thread.id ? { ...item, unread: 0 } : item)));
        setUnreadTotal((prev) => Math.max(0, prev - thread.unread));
      }
    } catch (cause) {
      setBanner({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'No se pudo abrir la conversación',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setBanner(null);
    setSyncWarnings([]);

    try {
      const res = await fetch('/api/inbox/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo sincronizar la bandeja');

      setBanner({
        type: 'success',
        message:
          data.imported > 0
            ? `Se importaron ${data.imported} mensajes nuevos.`
            : 'Sincronización completa: no hay mensajes nuevos.',
      });
      setSyncWarnings(data.warnings ?? []);
      await loadThreads();
    } catch (cause) {
      setBanner({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'No se pudo sincronizar la bandeja',
      });
    } finally {
      setSyncing(false);
    }
  };

  const toggleSetup = async () => {
    const next = !showSetup;
    setShowSetup(next);
    if (!next || setup) return;

    setSetupLoading(true);
    try {
      const res = await fetch('/api/inbox/setup');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo cargar la configuración');
      setSetup(data);
    } catch (cause) {
      setBanner({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'No se pudo cargar la configuración',
      });
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h1 className="page-title">Inbox</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Comentarios y mensajes directos de tus cuentas conectadas.
            {unreadTotal > 0 ? ` Tenés ${unreadTotal} sin leer.` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={toggleSetup}>
            <Settings2 size={16} style={{ marginRight: '0.4rem' }} />
            Webhooks
          </button>
          <button type="button" className="btn btn-primary" onClick={runSync} disabled={syncing}>
            <RefreshCw size={16} style={{ marginRight: '0.4rem', ...(syncing ? SPIN : {}) }} />
            {syncing ? 'Sincronizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {banner && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            borderLeft: `4px solid ${
              banner.type === 'error' ? 'var(--danger-color, #dc2626)' : 'var(--success-color, #16a34a)'
            }`,
          }}
        >
          {banner.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span style={{ flex: 1, fontSize: '0.9rem' }}>{banner.message}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            aria-label="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {syncWarnings.length > 0 && (
        <div
          className="card"
          style={{ padding: '0.85rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
        >
          <strong style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
            Avisos de la sincronización
          </strong>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {syncWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {showSetup && <SetupPanel setup={setup} loading={setupLoading} />}

      <div
        className="card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)',
          gap: 0,
          overflow: 'hidden',
          minHeight: '520px',
          padding: 0,
        }}
      >
        <div style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div
            style={{
              padding: '0.75rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                style={{ ...SELECT_STYLE, flex: 1 }}
                aria-label="Filtrar por red"
              >
                <option value="">Todas las redes</option>
                <option value="instagram_business">Instagram</option>
                <option value="facebook_page">Facebook</option>
              </select>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                style={{ ...SELECT_STYLE, flex: 1 }}
                aria-label="Filtrar por tipo"
              >
                <option value="">Todo</option>
                <option value="COMMENT">Comentarios</option>
                <option value="MESSAGE">Mensajes</option>
              </select>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
              />
              Sólo sin leer
            </label>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '620px' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Loader2 size={20} style={SPIN} /> Cargando…
              </div>
            ) : threads.length === 0 ? (
              <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <MessageCircle size={32} style={{ marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>No hay conversaciones.</p>
                <p style={{ fontSize: '0.8rem' }}>
                  Si ya tenés comentarios o mensajes en tus redes, probá con «Actualizar». Si sigue vacío, revisá
                  la configuración de «Webhooks».
                </p>
              </div>
            ) : (
              threads.map((thread) => {
                const active = thread.id === selectedId;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => openThread(thread)}
                    style={{
                      display: 'flex',
                      gap: '0.65rem',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem',
                      border: 'none',
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: active ? 'var(--card-hover)' : 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: '2.2rem',
                        height: '2.2rem',
                        borderRadius: '50%',
                        backgroundColor: 'var(--primary-color)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      {initials(thread.participantName ?? thread.account)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {thread.participantName ?? 'Contacto'}
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                          {formatWhen(thread.lastMessageAt)}
                        </span>
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.72rem',
                          color: 'var(--text-secondary)',
                          margin: '0.15rem 0 0.25rem',
                        }}
                      >
                        {thread.kind === 'MESSAGE' ? <Mail size={12} /> : <MessageCircle size={12} />}
                        {KIND_LABELS[thread.kind] ?? thread.kind} · {platformLabel(thread.platform)} · {thread.account}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          style={{
                            flex: 1,
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {thread.lastMessage?.body || 'Sin texto'}
                        </span>
                        {thread.unread > 0 && (
                          <span
                            style={{
                              flexShrink: 0,
                              minWidth: '1.3rem',
                              padding: '0 0.35rem',
                              borderRadius: '999px',
                              backgroundColor: 'var(--primary-color)',
                              color: '#fff',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              textAlign: 'center',
                            }}
                          >
                            {thread.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedId ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '3rem 1.5rem',
                color: 'var(--text-secondary)',
              }}
            >
              <MessageCircle size={40} style={{ marginBottom: '0.75rem' }} />
              <p style={{ fontSize: '0.9rem' }}>Elegí una conversación para verla.</p>
            </div>
          ) : detailLoading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={22} style={SPIN} />
            </div>
          ) : detail ? (
            <>
              <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.95rem' }}>{detail.participantName ?? 'Contacto'}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {KIND_LABELS[detail.kind] ?? detail.kind} · {platformLabel(detail.platform)} · {detail.account}
                  </span>
                  {detail.permalink && (
                    <a
                      href={detail.permalink}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        marginLeft: 'auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.78rem',
                        color: 'var(--primary-color)',
                      }}
                    >
                      Ver publicación <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                {detail.subject && (
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Sobre: {detail.subject}
                  </p>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', maxHeight: '440px' }}>
                {detail.messages.map((message) => {
                  const outbound = message.direction === 'OUTBOUND';
                  return (
                    <div
                      key={message.id}
                      style={{
                        display: 'flex',
                        justifyContent: outbound ? 'flex-end' : 'flex-start',
                        marginBottom: '0.6rem',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '78%',
                          padding: '0.6rem 0.75rem',
                          borderRadius: 'var(--radius-lg)',
                          backgroundColor: outbound ? 'var(--primary-color)' : 'var(--card-hover)',
                          color: outbound ? '#fff' : 'var(--text-primary)',
                          fontSize: '0.87rem',
                          lineHeight: 1.4,
                        }}
                      >
                        {!outbound && message.authorName && (
                          <div style={{ fontSize: '0.72rem', opacity: 0.75, marginBottom: '0.2rem' }}>
                            {message.authorName}
                          </div>
                        )}
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.body}</div>
                        {message.attachments?.map((attachment, index) => (
                          <a
                            key={index}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'block',
                              marginTop: '0.35rem',
                              fontSize: '0.78rem',
                              color: outbound ? '#fff' : 'var(--primary-color)',
                              textDecoration: 'underline',
                            }}
                          >
                            {attachment.type === 'image' ? 'Ver imagen' : `Ver archivo (${attachment.type})`}
                          </a>
                        ))}
                        <div style={{ fontSize: '0.68rem', opacity: 0.7, marginTop: '0.3rem', textAlign: outbound ? 'right' : 'left' }}>
                          {formatWhen(message.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', padding: '0.75rem' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      flex: 1,
                      minWidth: '12rem',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.45,
                    }}
                  >
                    Meta restringe el envío de respuestas desde aplicaciones externas. Abrí la
                    conversación en {platformLabel(detail.platform)} y respondé ahí: el mensaje ya
                    está cargado.
                  </p>
                  <a
                    className="btn btn-primary"
                    href={replyLink(detail).href}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {replyLink(detail).label}
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function SetupPanel({ setup, loading }: { setup: InboxSetup | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <Loader2 size={18} style={SPIN} /> Cargando configuración…
      </div>
    );
  }

  if (!setup) return null;

  return (
    <div className="card" style={{ padding: '1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>
        Configuración del webhook de Meta
      </h2>

      <ol style={{ margin: '0 0 0.9rem', paddingLeft: '1.2rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        <li>
          En Meta for Developers, abrí tu app → <strong>Webhooks</strong> → <strong>Page</strong> y luego{' '}
          <strong>Instagram</strong>.
        </li>
        <li>
          Callback URL: <code>{setup.callbackUrl}</code>
        </li>
        <li>
          Verify token: el valor de <code>META_WEBHOOK_VERIFY_TOKEN</code> de tu servidor
          {setup.verifyTokenConfigured ? ' (configurado ✅)' : ' (falta configurarlo ⚠️)'}.
        </li>
        <li>
          Suscribí los campos de <strong>Page</strong>: <code>{setup.webhookFields.pages.join(', ')}</code> y los de{' '}
          <strong>Instagram</strong>: <code>{setup.webhookFields.instagram.join(', ')}</code>.
        </li>
      </ol>

      {setup.accounts.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Todavía no hay cuentas conectadas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {setup.accounts.map((account) => (
            <div
              key={account.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--sidebar-bg)',
              }}
            >
              {account.missingFields && account.missingFields.length > 0 ? (
                <AlertCircle size={16} style={{ color: 'var(--danger-color, #dc2626)', flexShrink: 0, marginTop: 2 }} />
              ) : (
                <CheckCircle2 size={16} style={{ color: 'var(--success-color, #16a34a)', flexShrink: 0, marginTop: 2 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <strong>{account.account}</strong>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>({platformLabel(account.platform)})</span>
                <div style={{ color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  {account.error
                    ? `No se pudo verificar: ${account.error}`
                    : account.missingFields === null
                      ? 'Se verifica a través de la Página vinculada.'
                      : account.missingFields.length === 0
                        ? 'Todos los campos están suscriptos.'
                        : `Faltan suscribir: ${account.missingFields.join(', ')}. Probá «Actualizar» para reintentar.`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
