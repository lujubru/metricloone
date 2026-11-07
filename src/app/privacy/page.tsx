import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, APP_URL, CONTACT_EMAIL, LAST_UPDATED } from '@/lib/legal';

export const metadata: Metadata = {
  title: `Privacidad | ${APP_NAME}`,
  description: 'Cómo se recopilan, usan y almacenan los datos en la aplicación.',
};

// Lee las variables legales en tiempo de ejecución, no en el build.
export const dynamic = 'force-dynamic';

const sectionStyle: React.CSSProperties = { marginBottom: '1.75rem' };
const headingStyle: React.CSSProperties = { fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem' };
const textStyle: React.CSSProperties = { color: '#4b5563', lineHeight: 1.7, fontSize: '0.9375rem' };
const listStyle: React.CSSProperties = { ...textStyle, paddingLeft: '1.25rem', marginTop: '0.5rem' };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="page-title">Política de Privacidad</h1>
      <p className="page-subtitle">Última actualización: {LAST_UPDATED}</p>

      <div className="card" style={{ maxWidth: '52rem' }}>
        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Responsable</h2>
          <p style={textStyle}>
            {APP_NAME} es una aplicación de gestión de redes sociales disponible en {APP_URL}. Para cualquier
            consulta sobre esta política podés escribir a <strong>{CONTACT_EMAIL}</strong>.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Qué datos recopilamos</h2>
          <ul style={listStyle}>
            <li>Datos de tu cuenta de Facebook que autorizás al iniciar sesión: identificador de usuario, nombre y correo electrónico.</li>
            <li>Tokens de acceso de las Páginas de Facebook y de las cuentas de Instagram Business que conectás.</li>
            <li>Perfiles sociales conectados: nombre de usuario, identificador público y cantidad de seguidores.</li>
            <li>Contenido que creás en la app: publicaciones, textos, URLs de medios y fechas de programación.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Para qué los usamos</h2>
          <ul style={listStyle}>
            <li>Autenticarte y mantener tu sesión.</li>
            <li>Mostrar los perfiles conectados y sus métricas.</li>
            <li>Programar y publicar contenido en las Páginas de Facebook y cuentas de Instagram que autorizaste.</li>
          </ul>
          <p style={{ ...textStyle, marginTop: '0.5rem' }}>
            No usamos tus datos para publicidad, no los vendemos y no los compartimos con terceros ajenos a la
            operación del servicio.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Con quién se comparten</h2>
          <p style={textStyle}>
            El contenido que programás se envía a la Graph API de Meta exclusivamente para publicarlo en tu nombre.
            La base de datos y el alojamiento de la aplicación corren en proveedores de infraestructura que actúan
            como encargados del tratamiento.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Conservación</h2>
          <p style={textStyle}>
            Conservamos los datos mientras tu cuenta esté activa. Al desconectar un perfil se eliminan sus tokens de
            acceso; al solicitar la eliminación de la cuenta se borran la cuenta, los perfiles conectados y las
            publicaciones asociadas.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Seguridad</h2>
          <p style={textStyle}>
            El acceso a la aplicación se realiza mediante OAuth de Meta: nunca manejamos tu contraseña de Facebook.
            El tráfico se cifra con HTTPS y los tokens se almacenan únicamente en el servidor.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Cookies</h2>
          <p style={textStyle}>
            Usamos una cookie de sesión estrictamente necesaria para mantener tu sesión iniciada. No usamos cookies
            publicitarias ni de seguimiento.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Tus derechos</h2>
          <p style={textStyle}>
            Podés acceder, rectificar o eliminar tus datos en cualquier momento. Las instrucciones para eliminarlos
            están en <Link href="/data-deletion" style={{ color: '#4f46e5' }}>Eliminación de datos</Link> o podés
            escribir a <strong>{CONTACT_EMAIL}</strong>.
          </p>
        </div>

        <div style={{ ...sectionStyle, marginBottom: 0 }}>
          <h2 style={headingStyle}>9. Cambios</h2>
          <p style={textStyle}>
            Si modificamos esta política, actualizaremos la fecha indicada al inicio de la página.
          </p>
        </div>
      </div>
    </>
  );
}
