# Metricool Clone

Clon funcional (MVP) de Metricool: panel para conectar perfiles sociales, planificar publicaciones y administrar enlaces, construido con **Next.js 16 (App Router)**, **NextAuth v4**, **Prisma** y **PostgreSQL**.

## Funcionalidad

| Sección | Estado | Descripción |
| --- | --- | --- |
| `/` Overview | OK | Contadores de cuentas conectadas, posts totales, programados y publicados, más el listado de perfiles conectados. |
| `/connections` | OK | Conexión vía Facebook Login (OAuth), selección de Páginas de Facebook y de cuentas de Instagram Business vinculadas a esas Páginas. |
| `/planning` | OK | Calendario/listado de publicaciones con creación, edición y borrado. Muestra el estado (`DRAFT`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, `FAILED`), el error de publicación y permite reintentar. |
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
| `CRON_SECRET` | Si (server) | Secreto para invocar `/api/cron/publish`. |
| `SCHEDULER_ENABLED` | No | `false` desactiva el scheduler interno; `true` lo fuerza en desarrollo. |
| `PUBLISH_INTERVAL_SECONDS` | No | Intervalo del scheduler interno en segundos (default `60`, mínimo `15`). |
| `FACEBOOK_GRAPH_VERSION` | No | Versión de la Graph API (default `v23.0`). |

En la app de Meta, configura la redirect URI de OAuth valida:
`https://<tu-dominio>/api/auth/callback/facebook`.

Permisos solicitados: `email`, `public_profile`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`.

Los permisos de Instagram (`instagram_basic`, `instagram_content_publish`) deben agregarse también en el panel de la app de Meta; mientras la app esté en modo *Development* solo funcionan para usuarios con rol en la app. Si ya habías iniciado sesión antes de agregarlos, hay que cerrar sesión y volver a entrar con Facebook para autorizarlos.

## Base de datos

Modelos en `prisma/schema.prisma`:

- `User`, `Account`, `Session`, `VerificationToken`: estándar de NextAuth.
- `SocialProfile`: perfil conectado (`platform`, `profileId`, tokens, `tokenExpiresAt`).
- `Post`: contenido, `mediaUrls`, `scheduledFor`, `status`, `publishedAt`, `facebookPostId`, `errorMessage`, `attempts`, relación con `User` y `SocialProfile`.

Las migraciones están en `prisma/migrations/` y se aplican con `prisma migrate deploy`.

## API

| Ruta | Métodos | Uso |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | Login/logout con Facebook. |
| `/api/facebook/pages` | GET | Lista las Páginas del usuario autenticado en Facebook. |
| `/api/facebook/save-pages` | POST | Guarda las Páginas seleccionadas como `SocialProfile`. |
| `/api/instagram/accounts` | GET | Lista las cuentas de Instagram Business vinculadas a las Páginas del usuario (no expone tokens). |
| `/api/instagram/save-accounts` | POST | Guarda las cuentas de Instagram seleccionadas como `SocialProfile` (`instagram_business`). |
| `/api/profiles` | GET | Perfiles conectados del usuario. |
| `/api/profiles/[id]` | DELETE | Desconecta un perfil. |
| `/api/posts` | GET/POST | Lista y crea publicaciones. |
| `/api/posts/[id]` | PATCH/DELETE | Reprograma (y reinicia intentos) o elimina una publicación. |
| `/api/posts/[id]/publish` | POST | Publica el post inmediatamente en la red del perfil (Página de Facebook o cuenta de Instagram). |
| `/api/cron/publish` | GET/POST | Publica los posts vencidos. Requiere `Authorization: Bearer $CRON_SECRET`. |

## Publicación automática

Los posts con estado `SCHEDULED` cuya `scheduledFor` ya pasó se envían a la red del perfil asociado mediante la Graph API (`src/lib/facebook.ts`, `src/lib/instagram.ts` y `src/lib/publisher.ts`). Para Páginas de Facebook:

- sin media -> `POST /{page-id}/feed`,
- 1 media -> `POST /{page-id}/photos`,
- varias medias -> fotos con `published=false` y luego `/feed` con `attached_media`.

Cada post pasa por `SCHEDULED -> PUBLISHING -> PUBLISHED | FAILED`. La toma del post es atómica (`updateMany` con `status: "SCHEDULED"`), por lo que varios workers o el scheduler interno más el cron externo nunca publican dos veces el mismo post. Los errores de red/5xx/rate-limit se reintentan hasta 3 veces (`attempts`); los de token o permisos (`190`, `100`, `200`) fallan de inmediato y quedan visibles en `/planning` junto al botón de reintento.

### Instagram

Las cuentas de Instagram Business/Creator se publican con la Instagram Graph API usando el token de la Página a la que están vinculadas (`src/lib/instagram.ts`):

- 1 imagen -> `POST /{ig-user-id}/media` con `image_url` + `caption`,
- 1 video (MP4/MOV) -> `media_type=REELS` con `video_url`,
- 2 a 10 medios -> contenedores hijos (`is_carousel_item=true`) y luego `media_type=CAROUSEL`.

Después de crear el contenedor se consulta `status_code` hasta `FINISHED` (los videos tardan) y se publica con `media_publish`. Instagram **no permite publicaciones sin media**: la API rechaza el post y el formulario lo avisa antes de programar.

Existen dos disparadores, y puedes usar uno, otro o ambos:

1. **Scheduler interno** (`src/instrumentation.ts`): arranca con el servidor en producción y ejecuta `publishDuePosts()` cada `PUBLISH_INTERVAL_SECONDS`.
2. **Cron externo**: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/publish`.

Los posts que queden en `PUBLISHING` más de 10 minutos (por un reinicio a mitad de publicación) se devuelven a `SCHEDULED` automáticamente.

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

La publicacion automatica funciona sin configurar nada extra (scheduler interno cada 60s). Si prefieres un cron externo, desactiva el interno con `SCHEDULER_ENABLED=false` y crea una **Scheduled Task** en Coolify:

```
curl -fsS -X POST -H "Authorization: Bearer <CRON_SECRET>" http://<host-interno>:3000/api/cron/publish
```

Programala cada minuto (o cada 5). La respuesta JSON informa `published`, `retried`, `failed` y `skipped`.