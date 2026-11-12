'use client';

import { useState, useEffect, useRef } from 'react';
import { Film, Loader2, Trash2, Upload, X } from 'lucide-react';
import type { SocialProfile } from '@/lib/types';
import {
  MAX_MEDIA_ITEMS,
  MAX_STORY_MEDIA_ITEMS,
  MEDIA_ACCEPT_ATTRIBUTE,
  MEDIA_MAX_FILE_MB,
  POST_TYPE_POST,
  POST_TYPE_STORY,
  mediaKindFromFilename,
  mediaKindFromMime,
  type PostType,
  type UploadedMedia,
} from '@/lib/media';

const MAX_FILE_BYTES = MEDIA_MAX_FILE_MB * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
    const soon = new Date(Date.now() + 5 * 60 * 1000);
    soon.setMinutes(soon.getMinutes() - soon.getTimezoneOffset());
    return soon.toISOString().slice(0, 16);
  });
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [postType, setPostType] = useState<PostType>(POST_TYPE_POST);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaIdsRef = useRef<string[]>([]);
  const mediaSavedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedProfile = profiles.find((p) => p.id === socialProfileId);
  const isInstagram = selectedProfile?.platform === 'instagram_business';
  // Las Historias sólo existen en Instagram: en otras plataformas se usa Publicación.
  const effectivePostType: PostType = isInstagram ? postType : POST_TYPE_POST;
  const isStory = effectivePostType === POST_TYPE_STORY;
  const needsMedia = isInstagram;
  const maxMediaItems = isStory ? MAX_STORY_MEDIA_ITEMS : MAX_MEDIA_ITEMS;

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    mediaIdsRef.current = media.map((item) => item.id);
  }, [media]);

  // Si el modal se cierra sin programar el post, los archivos ya subidos se
  // descartan para no dejar medios huérfanos en la base.
  useEffect(() => {
    return () => {
      if (mediaSavedRef.current) return;
      const ids = mediaIdsRef.current;
      if (ids.length === 0) return;
      void fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, []);

  const removeMedia = (ids: string[]) => {
    setMedia((current) => current.filter((item) => !ids.includes(item.id)));
    // Libera el espacio de los archivos que el usuario descartó.
    void fetch('/api/media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => undefined);
  };

  const handlePostTypeChange = (next: PostType) => {
    if (next === postType) return;
    setError('');
    setPostType(next);

    if (next === POST_TYPE_STORY && media.length > MAX_STORY_MEDIA_ITEMS) {
      const keep = media.slice(0, MAX_STORY_MEDIA_ITEMS);
      const discard = media.slice(MAX_STORY_MEDIA_ITEMS);
      setMedia(keep);
      void fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: discard.map((item) => item.id) }),
      }).catch(() => undefined);
    }
  };

  const uploadFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setError('');

    const remaining = maxMediaItems - media.length;
    if (remaining <= 0) {
      setError(
        isStory
          ? 'Una Historia admite un solo archivo. Quitá el actual para subir otro.'
          : `Ya tenés ${MAX_MEDIA_ITEMS} archivos, que es el máximo por publicación.`
      );
      return;
    }

    const accepted: File[] = [];

    for (const file of files.slice(0, remaining)) {
      const kind = mediaKindFromMime(file.type) ?? mediaKindFromFilename(file.name);
      if (!kind) {
        setError(`"${file.name}" no es un formato soportado. Usá JPG, PNG, WEBP, MP4 o MOV.`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" pesa ${formatSize(file.size)} y el máximo por archivo es ${MEDIA_MAX_FILE_MB} MB.`);
        return;
      }
      accepted.push(file);
    }

    if (files.length > remaining) {
      setError(
        isStory
          ? 'Una Historia admite un solo archivo; se subió el primero.'
          : `Sólo se pueden adjuntar ${MAX_MEDIA_ITEMS} archivos por publicación.`
      );
    }

    const form = new FormData();
    accepted.forEach((file) => form.append('files', file));

    setUploading(true);
    try {
      const res = await fetch('/api/media', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'No se pudieron subir los archivos.');
      } else {
        const uploaded: UploadedMedia[] = data.media || [];
        setMedia((current) => [...current, ...uploaded].slice(0, maxMediaItems));
      }
    } catch {
      setError('Error de red al subir los archivos.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!socialProfileId) {
      setError('Seleccioná un perfil.');
      return;
    }

    if (isStory && media.length !== MAX_STORY_MEDIA_ITEMS) {
      setError('Una Historia necesita exactamente una imagen o un video.');
      return;
    }

    if (needsMedia && media.length === 0) {
      setError('Instagram necesita al menos una imagen o video: subí un archivo.');
      return;
    }

    if (!isStory && !content.trim()) {
      setError('El contenido es obligatorio.');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          socialProfileId,
          scheduledFor: new Date(scheduledFor).toISOString(),
          mediaUrls: media.map((item) => item.url),
          postType: effectivePostType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'No se pudo crear el post.');
      } else {
        mediaSavedRef.current = true;
        setContent('');
        setMedia([]);
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
                  {p.username || p.profileId} · {p.platform === 'facebook_page' ? 'Facebook' : p.platform === 'instagram_business' ? 'Instagram' : p.platform}
                </option>
              ))}
            </select>
          )}
        </div>

        {!loadingProfiles && profiles.length === 0 && (
          <div style={{ fontSize: '0.8125rem', color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 'var(--radius-md)', padding: '0.75rem' }}>
            No hay perfiles conectados todavía. Andá a <a href="/connections" style={{ color: 'inherit', fontWeight: 600 }}>Conexiones</a> e importá una Página de Facebook o una cuenta de Instagram.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Tipo de publicación</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[
              { value: POST_TYPE_POST as PostType, label: 'Publicación' },
              { value: POST_TYPE_STORY as PostType, label: 'Historia' },
            ].map((option) => {
              const active = effectivePostType === option.value;
              const disabled = option.value === POST_TYPE_STORY && !isInstagram;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePostTypeChange(option.value)}
                  disabled={disabled}
                  title={disabled ? 'Las Historias sólo se publican en Instagram' : undefined}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${active ? 'var(--primary-color)' : 'var(--border-color)'}`,
                    backgroundColor: active ? 'rgba(59, 130, 246, 0.15)' : 'var(--sidebar-bg)',
                    color: disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
                    fontWeight: active ? 600 : 400,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {isStory && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Las Historias de Instagram no llevan texto ni carrusel: subí una imagen o un video y se publican como Historia.
            </span>
          )}
          {!isStory && isInstagram && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Publicación normal: carrusel de hasta {MAX_MEDIA_ITEMS} archivos.
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>
            Contenido {isStory ? '(no se usa en Historias)' : ''}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required={!isStory}
            rows={isStory ? 3 : 5}
            placeholder={isStory ? 'Las Historias no llevan texto, este campo se ignora.' : 'Escribe el contenido de tu publicación...'}
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
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Se interpreta en tu zona horaria. El planificador revisa cada ~60 s, así que se publica en el primer ciclo posterior a esa hora.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>
            {isStory ? 'Imagen o video' : 'Imágenes y videos'}{' '}
            {needsMedia ? '(obligatorio para Instagram)' : '(opcional)'}
          </label>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void uploadFiles(e.dataTransfer.files);
            }}
            style={{
              border: `1px dashed ${dragging ? 'var(--primary-color)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-md)',
              backgroundColor: dragging ? 'rgba(59, 130, 246, 0.08)' : 'var(--sidebar-bg)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              textAlign: 'center',
            }}
          >
            <Upload size={20} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Arrastrá los archivos acá o
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || media.length >= maxMediaItems}
            >
              {uploading ? 'Subiendo...' : 'Elegir archivos'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={MEDIA_ACCEPT_ATTRIBUTE}
              multiple={!isStory}
              onChange={(e) => void uploadFiles(e.target.files)}
              style={{ display: 'none' }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              JPG, PNG, WEBP, MP4 o MOV · hasta {MEDIA_MAX_FILE_MB} MB por archivo ·{' '}
              {media.length}/{maxMediaItems}
            </span>
          </div>

          {uploading && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <Loader2 size={14} style={{ animation: 'spin 2s linear infinite' }} /> Procesando archivos...
            </span>
          )}

          {media.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '0.5rem', marginTop: '0.25rem' }}>
              {media.map((item) => (
                <div
                  key={item.id}
                  style={{
                    position: 'relative',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)',
                    backgroundColor: '#0f172a',
                    aspectRatio: '1 / 1',
                  }}
                >
                  {item.kind === 'VIDEO' ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
                      <Film size={20} />
                      <span style={{ fontSize: '0.625rem', padding: '0 0.25rem', textAlign: 'center', wordBreak: 'break-all' }}>
                        {formatSize(item.size)}
                      </span>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.filename}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia([item.id])}
                    aria-label={`Quitar ${item.filename}`}
                    title={`Quitar ${item.filename}`}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: 'none',
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      color: '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {needsMedia && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {isStory
                ? 'Las Historias llevan un solo archivo. Instagram descarga el video desde esta app, por eso los archivos quedan guardados acá.'
                : 'Instagram no permite publicaciones sólo de texto. Las imágenes se convierten a JPG y podés mezclar hasta 10 fotos y videos en un carrusel.'}
            </span>
          )}
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
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo Post"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'flex',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        padding: '1.5rem 1rem',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          // `margin: auto` centra cuando hay espacio y permite scrollear cuando el
          // formulario es mas alto que el viewport (a diferencia de align-items: center).
          margin: 'auto',
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
