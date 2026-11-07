# Metricool Clone

Clon funcional (MVP) de Metricool: panel para conectar perfiles sociales, planificar publicaciones y administrar enlaces, construido con **Next.js 16 (App Router)**, **NextAuth v4**, **Prisma** y **PostgreSQL**.

## Funcionalidad

| Sección | Estado | Descripción |
| --- | --- | --- |
| `/` Overview | OK | Contadores de cuentas conectadas, posts totales, programados y publicados, más el listado de perfiles conectados. |
| `/connections` | OK | Conexión vía Facebook Login (OAuth) y selección de Páginas para guardarlas como perfiles sociales. |
| `/planning` | OK | Calendario/listado de publicaciones con creación, edición y borrado (estados `DRAFT`, `SCHEDULED`, `PUBLISHED`, `FAILED`). |
| `/settings` | OK | Datos de la sesión, cierre de sesión y desconexión de perfiles. |
| `/smartlink` | WIP | Constructor de página "link in bio". Solo estado en cliente (sin persistencia). |
| `/inbox` | WIP | Placeholder de comentarios/mensajes. |

## Stack

- Next.js 16 + React 19 (App Router, componentes cliente para el dashboard)
- NextAuth v4 con provider de Facebook y `@auth/prisma-adapter`
- Prisma 5 + PostgreSQL
- CSS global propio (`src/app/globals.css`) e iconos con `lucide-react`

## Puesta en marcha local

```bash
npm install
# crea el archivo .env con las variables de la tabla siguiente
npx prisma migrate deploy
npm run dev
```

Abre `http://localhost:3000`.

### Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Si | Cadena de conexión PostgreSQL. |
| `NEXTAUTH_SECRET` | Si | Secreto para firmar la sesión (`openssl rand -base64 32`). |
| `NEXTAUTH_URL` | Si | URL pública de la app (ej. `https://mi-dominio.com`). |
| `FACEBOOK_CLIENT_ID` | Si | App ID de Meta for Developers. |
| `FACEBOOK_CLIENT_SECRET` | Si | App Secret de Meta for Developers. |

En la app de Meta, configura la redirect URI de OAuth valida:
`https://<tu-dominio>/api/auth/callback/facebook`.

Permisos solicitados: `email`, `public_profile`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.

## Base de datos

Modelos en `prisma/schema.prisma`:

- `User`, `Account`, `Session`, `VerificationToken`: estándar de NextAuth.
- `SocialProfile`: perfil conectado (`platform`, `profileId`, tokens, `tokenExpiresAt`).
- `Post`: contenido, `mediaUrls`, `scheduledFor`, `status`, relación con `User` y `SocialProfile`.

Las migraciones están en `prisma/migrations/` y se aplican con `prisma migrate deploy`.

## API

| Ruta | Métodos | Uso |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | Login/logout con Facebook. |
| `/api/facebook/pages` | GET | Lista las Páginas del usuario autenticado en Facebook. |
| `/api/facebook/save-pages` | POST | Guarda las Páginas seleccionadas como `SocialProfile`. |
| `/api/profiles` | GET | Perfiles conectados del usuario. |
| `/api/profiles/[id]` | DELETE | Desconecta un perfil. |
| `/api/posts` | GET/POST | Lista y crea publicaciones. |
| `/api/posts/[id]` | PATCH/DELETE | Actualiza o elimina una publicación. |

## Despliegue (Docker / Coolify)

El repo incluye un `Dockerfile` multi-stage (Node 20 Alpine) que:

1. instala dependencias con `npm ci` (incluye dev deps para `prisma generate`),
2. compila la app con `npm run build`,
3. en el arranque ejecuta `npx prisma migrate deploy && npm start` en el puerto `3000`.

En Coolify:

1. Crea un recurso **Application -> Dockerfile** apuntando a este repositorio (rama `main`), puerto `3000`.
2. Añade las variables de entorno de la tabla anterior, con `NEXTAUTH_URL` = dominio público.
3. Añade una base de datos PostgreSQL y usa su URL interna como `DATABASE_URL`.
4. Despliega; las migraciones se aplican automáticamente en el arranque.