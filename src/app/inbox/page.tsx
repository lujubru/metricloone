import { Inbox } from 'lucide-react';

export default function InboxPage() {
  return (
    <>
      <h1 className="page-title">Inbox</h1>
      <p className="page-subtitle">Gestiona los comentarios y mensajes de tus perfiles.</p>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
        <Inbox size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Bandeja de entrada vacía</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '420px' }}>
          Aquí aparecerán los comentarios y mensajes directos de tus perfiles conectados. Conecta más perfiles para empezar a ver conversaciones.
        </p>
      </div>
    </>
  );
}
