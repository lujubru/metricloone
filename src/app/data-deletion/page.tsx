import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, APP_URL, CONTACT_EMAIL, LAST_UPDATED } from '@/lib/legal';

export const metadata: Metadata = {
  title: `Eliminación de datos | ${APP_NAME}`,
  description: 'Cómo solicitar la eliminación de tus datos personales.',
};

// Lee las variables legales en tiempo de ejecución, no en el build.
export const dynamic = 'force-dynamic';

const stepStyle: React.CSSProperties = { color: '#4b5563', lineHeight: 1.7, fontSize: '0.9375rem', marginBottom: '0.75rem' };
const headingStyle: React.CSSProperties = { fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem' };

export default function DataDeletionPage() {
  return (
    <>
      <h1 className="page-title">Eliminación de datos</h1>
      <p className="page-subtitle">Última actualización: {LAST_UPDATED}</p>

      <div className="card" style={{ maxWidth: '52rem' }}>
        <h2 style={headingStyle}>Eliminar los datos desde la aplicación</h2>
        <p style={stepStyle}>
          1. Iniciá sesión en <strong>{APP_URL}</strong> con tu cuenta de Facebook.
        </p>
        <p style={stepStyle}>
          2. Entrá a la sección <Link href="/settings" style={{ color: '#4f46e5' }}>Ajustes</Link> y desconectá cada
          perfil social listado. Esta acción borra del servidor el token de acceso y el perfil asociado.
        </p>
        <p style={stepStyle}>
          3. Si querés eliminar también los posts programados y tu cuenta, escribí a <strong>{CONTACT_EMAIL}</strong>{' '}
          indicando el nombre o el ID de tu cuenta de Facebook.
        </p>

        <h2 style={{ ...headingStyle, marginTop: '2rem' }}>Revocar el acceso de la app en Facebook</h2>
        <p style={stepStyle}>
          Ingresá a <em>Configuración y privacidad → Configuración → Aplicaciones y sitios web</em> de Facebook,
          buscá {APP_NAME} y elegí <strong>Eliminar</strong>. Esto invalida los tokens que la app tenía de tu cuenta.
        </p>

        <h2 style={{ ...headingStyle, marginTop: '2rem' }}>Qué se elimina</h2>
        <ul style={{ ...stepStyle, paddingLeft: '1.25rem' }}>
          <li>Tokens de acceso de Páginas de Facebook e Instagram.</li>
          <li>Perfiles sociales conectados y sus métricas almacenadas.</li>
          <li>Publicaciones, textos y URLs de medios creadas en la app.</li>
          <li>Tu cuenta de usuario, si la solicitás por correo.</li>
        </ul>

        <h2 style={{ ...headingStyle, marginTop: '2rem' }}>Plazos</h2>
        <p style={stepStyle}>
          Las desconexiones desde la app son inmediatas. Las solicitudes por correo se procesan dentro de los 30 días
          corridos siguientes y se confirman por respuesta al mismo correo. Solo se conservan registros técnicos
          mínimos durante ese período, por motivos de seguridad.
        </p>

        <h2 style={{ ...headingStyle, marginTop: '2rem' }}>Contacto</h2>
        <p style={{ ...stepStyle, marginBottom: 0 }}>
          <strong>{CONTACT_EMAIL}</strong> — también podés consultar la{' '}
          <Link href="/privacy" style={{ color: '#4f46e5' }}>Política de Privacidad</Link>.
        </p>
      </div>
    </>
  );
}
