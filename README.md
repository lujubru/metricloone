# Metricool Clone

Clon funcional (MVP) de Metricool: panel para conectar perfiles sociales, planificar publicaciones y administrar enlaces, construido con **Next.js 16 (App Router)**, **NextAuth v4**, **Prisma** y **PostgreSQL**.

## Estado de producción

| Dato | Valor |
| --- | --- |
| URL | <https://metricool.pixeldesarrollo.com> |
| Hosting | Coolify (Application -> Dockerfile, rama `main`, puerto `3000`) |
| Base de datos | PostgreSQL en **Railway** (externa a Coolify) |
| Login | email + contraseña (`/login`), roles `ADMIN` / `CLIENT` |
| Multi-tenant | activo desde el commit `d147457` (deploy verificado el 7/11/2026) |

Flujo de uso en producción:

1. El **ADMIN** entra a `/login` y desde `/admin` crea una cuenta por cliente (nombre, email, contraseña, App ID y App Secret de Facebook).
2. Cada cliente agrega en **su** app de Meta la redirect URI `https://metricool.pixeldesarrollo.com/api/connect/facebook/callback`.
3. El cliente entra a `/login` desde cualquier equipo con el email y la contraseña que le asignó el ADMIN, conecta su Facebook en `/connections` e importa Páginas e Instagram.
4. Todo (perfiles, posts, tokens) queda aislado por `tenantId`; el ADMIN no ve los datos de un cliente en el dashboard salvo que entre con el usuario de ese cliente.

> **Secretos críticos.** `NEXTAUTH_SECRET` invalida las sesiones si cambia y `APP_ENCRYPTION_KEY` hace ilegibles los App Secret guardados (habría que volver a cargarlos desde `/admin`). Se generan una vez y no se rotan.

## Funcionalidad

| Sección | Estado | Descripción |
| --- | --- | --- |
| `/login` | OK | Login propio con email y contraseña (NextAuth `credentials`). |
| `/admin` | OK | Sólo `ADMIN`: crea cuentas (tenants), carga el App ID/Secret de Facebook de cada una y gestiona sus usuarios. |
| `/` Overview | OK | Contadores de cuentas conectadas, posts totales, programados y publicados, más el listado de perfiles conectados. |
| `/connections` | OK | Conexión OAuth con la app de Facebook **de la propia cuenta**, selección de Páginas de Facebook e importación de las cuentas de Instagram Business vinculadas a esas Páginas. |
| `/planning` | OK | Calendario/listado de publicaciones con creación, edición y borrado. Permite **subir imágenes y videos** (varios por publicación) y elegir entre **Publicación** o **Historia**. Vistas **Día / Semana / Mes** reales, filtros por perfil, red, tipo y estado, navegación de período y el botón **Nuevo post** del topbar habilitado. Muestra miniaturas, el tipo, el estado (`DRAFT`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, `FAILED`), el error de publicación y permite reintentar. |
| `/settings` | OK | Datos de la sesión, cierre de sesión y desconexión de perfiles. |
| `/smartlink` | WIP | Constructor de página "link in bio". Solo estado en cliente (sin persistencia). |
| `/inbox` | OK | Bandeja unificada de **comentarios y mensajes directos** de las Páginas de Facebook y cuentas de Instagram conectadas. Ver [Inbox](#inbox-comentarios-y-mensajes-directos). |

## Stack

- Next.js 16 + React 19 (App Router, componentes cliente para el dashboard)
- NextAuth v4 con provider de `credentials` (contraseñas con bcrypt, sesión JWT)
- Prisma 5 + PostgreSQL
- CSS global propio (`src/app/globals.css`) e iconos con `lucide-react`

## Multi-tenant

Cada **cuenta** (`Tenant`) es un espacio de trabajo aislado: tiene sus usuarios, sus perfiles sociales, sus publicaciones y **su propia app de Facebook** (`fbAppId` + `fbAppSecret` cifrado con AES-256-GCM).

- El login de Facebook **no** pasa por NextAuth: `/api/connect/facebook/start` arma el diálogo OAuth con el App ID del tenant y `/api/connect/facebook/callback` guarda el token de usuario en `FbConnection`.
- Los Page Access Tokens no expiran, así que el App Secret sólo se usa durante el intercambio del código.
- Instagram se deriva de las Páginas ya guardadas: sólo aparecen las cuentas vinculadas a esas Páginas (`listInstagramAccounts(token, pageIds)`).
- Todas las consultas (`profiles`, `posts`, `publish`) filtran por `tenantId`; el `tenantId` sale del JWT, nunca del body.

Ventaja práctica: si cada cliente usa **su propia app** de Meta, su usuario de Facebook es Administrador/Tester de esa app y el flujo funciona en modo *Development*, sin App Review ni verificación de negocio.


## Puesta en marcha local

```bash
npm install
cp .env.example .env   # completá las variables
npx prisma migrate deploy
npm run db:bootstrap   # crea el primer ADMIN con ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev
```

Abre `http://localhost:3000`, entrá con el usuario administrador y creá las cuentas desde `/admin`.

### Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Si | Cadena de conexión PostgreSQL. |
| `NEXTAUTH_SECRET` | Si | Secreto para firmar la sesión (`openssl rand -base64 32`). |
| `NEXTAUTH_URL` | Si | URL pública de la app (ej. `https://mi-dominio.com`). También define la redirect URI que se muestra en `/admin`. |
| `APP_ENCRYPTION_KEY` | Si | Clave con la que se cifran los App Secret de cada tenant. Si cambia, hay que volver a cargarlos. |
| `ADMIN_EMAIL` | Si (bootstrap) | Email del primer administrador. |
| `ADMIN_PASSWORD` | Si (bootstrap) | Contraseña del primer administrador (mínimo 8 caracteres). |
| `ADMIN_NAME` | No | Nombre del primer administrador. |
| `CRON_SECRET` | Si (cron externo) | Secreto para invocar `/api/cron/publish`. |
| `SCHEDULER_ENABLED` | No | `false` desactiva el scheduler interno; `true` lo fuerza en desarrollo. |
| `PUBLISH_INTERVAL_SECONDS` | No | Intervalo del scheduler interno en segundos (default `60`, mínimo `15`). |
| `FACEBOOK_GRAPH_VERSION` | No | Versión de la Graph API (default `v23.0`). |
| `META_WEBHOOK_VERIFY_TOKEN` | Si (Inbox) | Cadena aleatoria que se pega como *Verify token* al configurar el webhook en cada app de Meta. Sin ella `/api/webhooks/meta` responde 500 en la verificación. |
| `LEGAL_CONTACT_EMAIL` | No | Email de contacto que muestran `/privacy` y `/data-deletion` (default `soporte@pixeldesarrollo.com`). |
| `NEXT_PUBLIC_APP_NAME` | No | Nombre visible en las páginas legales (default `Metricool Clone`). |

Las credenciales de Facebook **no** van en variables de entorno: se cargan por cuenta desde `/admin`.

En cada app de Meta hay que agregar la redirect URI de OAuth válida:

```
https://<tu-dominio>/api/connect/facebook/callback
```

Permisos solicitados: `email`, `public_profile`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`, `pages_messaging`, `pages_manage_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`.

Los permisos de **Inbox** (`pages_read_user_content`, `pages_messaging`, `pages_manage_engagement`, `instagram_manage_comments`, `instagram_manage_messages`) se agregaron después de la primera puesta en marcha: si conectaste las cuentas antes, hay que **volver a conectar Facebook** para que el token los incluya. La lista vive en `FACEBOOK_SCOPES` (`src/lib/facebook.ts`).


`business_management` se pide porque sin él las Páginas que están dentro de un Business Portfolio pueden no aparecer en `/me/accounts`.

Los permisos de Instagram (`instagram_basic`, `instagram_content_publish`) deben agregarse también en el panel de la app de Meta; mientras la app esté en modo *Development* solo funcionan para usuarios con rol en la app. Si ya habías iniciado sesión antes de agregarlos, hay que cerrar sesión y volver a entrar con Facebook para autorizarlos.

### Páginas que no aparecen al importar

La app pide la lista completa: recorre todas las páginas de resultados de `/me/accounts` y además suma las Páginas de los Business Portfolios del usuario (`/{business}/owned_pages` y `/{business}/client_pages`, requieren `business_management`). Si al abrir el modal faltan Páginas, el propio modal muestra los motivos detectados (conteo, permisos que faltan en el token y aviso de portafolio comercial).

Causas habituales, en orden de frecuencia:

1. **El diálogo de Facebook Login autoriza Página por Página** (checkboxes). Las que no se tildaron nunca se devuelven. Para volver a elegirlas: <https://www.facebook.com/settings?tab=business_tools> → la app → **Ver y editar** → tildar todas las Páginas; o eliminar la app y volver a iniciar sesión.
2. **El token guardado es anterior a los permisos actuales.** NextAuth no renueva el token al agregar scopes, así que un token viejo puede no tener `business_management` ni los de Instagram. Se detecta comparando `/me/permissions` con `FACEBOOK_SCOPES` (`src/lib/facebook.ts`); la solución es cerrar sesión y volver a entrar con Facebook.
3. **La Página vive en un Business Portfolio y el usuario no tiene rol directo** sobre ella: sin `business_management` no aparece en `/me/accounts`. También hay que aceptar la invitación a ese portafolio en Business Suite.
4. **Rol insuficiente**: hacen falta permisos de Administrador o Editor sobre la Página (los accesos parciales de Business Manager no alcanzan).

Para verificar qué está pasando con un token concreto: `/me/permissions` (permisos concedidos) y `/me/accounts` (Páginas visibles).

### Pasar la app de un cliente a producción

Normalmente **no hace falta**: si el cliente tiene rol Administrador/Desarrollador en su propia app de Meta, el login y la publicación funcionan con la app en modo *Development*.

Sólo si se quiere que usuarios sin rol en la app puedan conectar (por ejemplo, que un community manager conecte su propio Facebook) hay que pasar esa app a Live:

1. Completar en *App Settings → Basic*: dominios, Privacy Policy URL (`/privacy`), Terms of Service URL, User Data Deletion (`/data-deletion`), ícono (PNG sin canal alfa) y categoría.
2. Verificar el negocio en Meta Business Suite.
3. En *App Review → Permissions and features* pedir **Advanced Access** para `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic` e `instagram_content_publish` (cada uno pide descripción y screencast del flujo).
4. Cambiar el switch de la app a **Live**.
5. Reconectar Facebook desde `/connections` para que el token incluya los scopes nuevos.

Las páginas `/privacy` y `/data-deletion` son públicas y sirven como URLs legales en la configuración de Meta; el email de contacto se configura con `LEGAL_CONTACT_EMAIL`.


## Base de datos

Modelos en `prisma/schema.prisma`:

- `Tenant`: cuenta/espacio de trabajo (`slug`, `fbAppId`, `fbAppSecret` cifrado con AES-256-GCM).
- `FbConnection`: token de usuario de Facebook por tenant (`userAccessToken`, `fbUserId`, `tokenExpiresAt`).
- `User`, `Account`, `Session`, `VerificationToken`: `User` suma `passwordHash`, `role` (`ADMIN`/`CLIENT`) y `tenantId`; el resto es estándar de NextAuth.
- `SocialProfile`: perfil conectado (`platform`, `profileId`, `parentProfileId` para el Instagram de una Página, tokens, `tokenExpiresAt`), único por `tenantId + platform + profileId`.
- `Post`: contenido, `mediaUrls`, `postType` (`POST`/`STORY`), `scheduledFor`, `status`, `publishedAt`, `facebookPostId`, `errorMessage`, `attempts`, relación con `Tenant`, `User` y `SocialProfile`.
- `MediaAsset`: archivo subido desde el calendario (`filename`, `mimeType`, `kind` `IMAGE`/`VIDEO`, `size`, `data` como `bytea`), aislado por `tenantId`. Se sirve públicamente en `/api/media/<id>/<filename>` y se borra junto con el post cuando ya no lo referencia ningún otro.
- `InboxThread`: conversación de la bandeja (`kind` `COMMENT`/`MESSAGE`, `platform`, `externalThreadId` = id del post de FB, del media de IG o el PSID/IGSID del interlocutor en los DMs, `subject`, `permalink`, `participantName`, `participantExternalId`, `lastMessageAt`). Único por `tenantId + platform + kind + externalThreadId`.
- `InboxMessage`: mensaje o comentario dentro de un hilo (`externalId` único global para deduplicar webhooks y syncs, `direction` `INBOUND`/`OUTBOUND`, `body`, `authorName`, `authorExternalId`, `permalink`, `attachments` en JSON, `isRead`, `remoteCreatedAt`).

Las migraciones están en `prisma/migrations/` y se aplican con `prisma migrate deploy`.

## API

| Ruta | Métodos | Uso |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | Login/logout con email y contraseña. |
| `/api/tenant` | GET | Datos del tenant de la sesión (nunca devuelve el App Secret). |
| `/api/connect/facebook/start` | GET | Inicia el OAuth con la app de Facebook del tenant. |
| `/api/connect/facebook/callback` | GET | Recibe el código, guarda `FbConnection` y vuelve a `/connections`. |
| `/api/admin/tenants` | GET/POST | Lista y crea cuentas con su usuario cliente y credenciales. |
| `/api/admin/tenants/[id]` | PATCH/DELETE | Renombra, cambia credenciales o borra una cuenta. |
| `/api/admin/users` | GET/POST | Lista y crea usuarios de una cuenta. |
| `/api/admin/users/[id]` | PATCH/DELETE | Edita o borra un usuario. |
| `/api/facebook/pages` | GET | Lista las Páginas del token guardado (paginado + Páginas de Business Portfolio) y devuelve `warnings` con los permisos faltantes. |
| `/api/facebook/save-pages` | POST | Guarda las Páginas seleccionadas como `SocialProfile` (revalida contra la Graph API). |
| `/api/instagram/accounts` | GET | Lista las cuentas de Instagram Business vinculadas a las **Páginas ya conectadas** (sin exponer tokens). |
| `/api/instagram/save-accounts` | POST | Guarda las cuentas de Instagram seleccionadas como `SocialProfile` (`instagram_business`, con `parentProfileId`). |
| `/api/profiles` | GET | Perfiles conectados del tenant. |
| `/api/profiles/[id]` | DELETE | Desconecta un perfil. |
| `/api/posts` | GET/POST | Lista y crea publicaciones (`content`, `mediaUrls`, `postType`, `socialProfileId`, `scheduledFor`). |
| `/api/posts/[id]` | PATCH/DELETE | Reprograma (y reinicia intentos) o elimina una publicación (también borra sus medios). |
| `/api/media` | POST/DELETE | Sube archivos (`multipart/form-data`, campo `files`) y devuelve `{ media: [{ id, url, filename, mimeType, kind, size }] }`; `DELETE` recibe `{ ids }` y elimina los medios del tenant. |
| `/api/media/[id]/[filename]` | GET/HEAD | Sirve el archivo almacenado en la base (público, con `Cache-Control` inmutable). La extensión es obligatoria. |
| `/api/posts/[id]/publish` | POST | Publica el post inmediatamente en la red del perfil (Página de Facebook o cuenta de Instagram). |
| `/api/cron/publish` | GET/POST | Publica los posts vencidos. Requiere `Authorization: Bearer $CRON_SECRET`. |

| `/api/inbox` | GET | Lista los hilos del tenant con el último mensaje, el conteo de no leídos y los filtros `platform`, `kind` y `unreadOnly`. |
| `/api/inbox/[id]` | GET/PATCH/DELETE | Detalle del hilo con todos sus mensajes; `PATCH { isRead }` lo marca leído; `DELETE` borra el hilo local (no toca Meta). |
| `/api/inbox/[id]/reply` | POST | Responde al hilo: mensaje directo si es `MESSAGE`, respuesta al comentario si es `COMMENT`. Persiste el `OUTBOUND` en la misma transacción. |
| `/api/inbox/sync` | POST | Trae comentarios y mensajes de todas las cuentas conectadas (`maxDuration` 60 s) y devuelve `imported` más `warnings` por fuente. |
| `/api/inbox/setup` | GET | Diagnóstico: `callbackUrl` del webhook, si `META_WEBHOOK_VERIFY_TOKEN` está definida, campos requeridos y, por cuenta, qué campos ya están suscriptos. |
| `/api/webhooks/meta` | GET/POST | Webhook público de Meta. `GET` responde el `hub.challenge` de la verificación; `POST` valida `X-Hub-Signature-256` con el App Secret **del tenant dueño del perfil** e ingesta el evento. |

## Publicación automática

Los posts con estado `SCHEDULED` cuya `scheduledFor` ya pasó se envían a la red del perfil asociado mediante la Graph API (`src/lib/facebook.ts`, `src/lib/instagram.ts` y `src/lib/publisher.ts`). Para Páginas de Facebook:

- sin media -> `POST /{page-id}/feed`,
- 1 imagen -> `POST /{page-id}/photos`,
- 1 video -> `POST /{page-id}/videos` con `file_url`,
- varias medias -> fotos/videos sin publicar (`published=false`) y luego `/feed` con `attached_media`.

Las **Historias** sólo se publican en Instagram: si un post `STORY` apunta a una Página de Facebook, el publisher lo marca como `FAILED` con un error no reintentable (Meta no expone publicación de Stories para Páginas).

Cada post pasa por `SCHEDULED -> PUBLISHING -> PUBLISHED | FAILED`. La toma del post es atómica (`updateMany` con `status: "SCHEDULED"`), por lo que varios workers o el scheduler interno más el cron externo nunca publican dos veces el mismo post. Los errores de red/5xx/rate-limit se reintentan hasta 3 veces (`attempts`); los de token o permisos (`190`, `100`, `200`) fallan de inmediato y quedan visibles en `/planning` junto al botón de reintento.

### Instagram

Las cuentas de Instagram Business/Creator se publican con la Instagram Graph API usando el token de la Página a la que están vinculadas (`src/lib/instagram.ts`):

- 1 imagen -> `POST /{ig-user-id}/media` con `image_url` + `caption`,
- 1 video (MP4/MOV) -> `media_type=REELS` con `video_url`,
- 2 a 10 medios -> contenedores hijos (`is_carousel_item=true`) y luego `media_type=CAROUSEL`,
- Historia (`postType=STORY`) -> `media_type=STORIES` con `image_url` o `video_url`, **sin** `caption` y con **un único** medio (así lo exige la API).

Después de crear el contenedor se consulta `status_code` hasta `FINISHED` (los videos tardan) y se publica con `media_publish`. Instagram **no permite publicaciones sin media**: la API rechaza el post y el formulario lo avisa antes de programar.

Existen dos disparadores, y puedes usar uno, otro o ambos:

1. **Scheduler interno** (`src/instrumentation.ts`): arranca con el servidor en producción y ejecuta `publishDuePosts()` cada `PUBLISH_INTERVAL_SECONDS`.
2. **Cron externo**: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/publish`.

Los posts que queden en `PUBLISHING` más de 10 minutos (por un reinicio a mitad de publicación) se devuelven a `SCHEDULED` automáticamente.

## Calendario (`/planning`)

- **Vistas Día / Semana / Mes** con navegación de período (`‹` / `›` / «hoy»). El período visible se calcula desde un `anchorDate` en estado; antes el mes estaba fijo a `new Date()` y los botones no tenían handler.
- **Filtros** por perfil, red, tipo (`POST`/`STORY`) y estado, aplicados en el cliente sobre la lista ya cargada.
- El botón **Nuevo post** del topbar y el de dentro del calendario abren el mismo modal. El topbar usa `backdrop-filter: blur(8px)`, que crea un contexto de apilamiento y rompía el `position: fixed` del modal (quedaba detrás y no se podía clickear); el modal se renderiza ahora en un contenedor que escapa a ese contexto y con `z-index` propio.
- Se quitó el hover oculto «+ Publicar» de las celdas vacías: crear publicaciones se hace sólo por los dos botones.

## Medios subidos (imágenes y videos)

En `/planning` los medios se suben como archivos, no como URLs:

- **Imágenes**: JPG, PNG, WebP, HEIC/HEIF (se convierten a JPEG con `sharp`, máx. 2048 px y `quality` 90).
- **Videos**: MP4 y MOV.
- Hasta **10 medios por publicación** y **1 por historia**; máximo **16 MB por archivo**.
- Los archivos se guardan en la base de datos (`MediaAsset.data` como `bytea`) y se sirven desde `/api/media/<id>/<filename>`. No hace falta volumen persistente en Docker: sobreviven a redeploys y a un contenedor nuevo.
- Meta descarga el medio desde una **URL pública**, así que `NEXTAUTH_URL` debe ser el dominio real (`https://...`). Si no está definida se usa el host de la petición (`x-forwarded-host`), lo que puede fallar durante la subida detrás de proxies.
- Cada archivo subido queda asociado al `tenantId` de la sesión; `DELETE /api/media` y el borrado del post lo eliminan también de la base.

Límites y formatos aceptados están centralizados en `src/lib/media.ts` y `src/lib/post-validation.ts`.

## Inbox (comentarios y mensajes directos)

`/inbox` es una bandeja de dos paneles que unifica **comentarios** y **mensajes directos** de las Páginas de Facebook y las cuentas de Instagram Business conectadas en `/connections`.

- Panel izquierdo: hilos con avatar de iniciales, red, tipo, badge de no leídos y extracto del último mensaje. Filtros por red, tipo y «sólo sin leer».
- Panel derecho: conversación completa con burbujas `INBOUND` / `OUTBOUND`, adjuntos como enlaces y caja de respuesta.
- Al abrir un hilo se marca leído (`PATCH /api/inbox/[id]`) y se descuenta del contador global.
- Botón **Actualizar** -> `POST /api/inbox/sync` (importa lo que ya existe) y botón **Webhooks** -> `GET /api/inbox/setup` (diagnóstico de la configuración en Meta).

### Cómo llegan los datos

Hay dos caminos y conviene tener los dos:

1. **Webhook en tiempo real** (`/api/webhooks/meta`). Es la vía principal: sin webhook el Inbox sólo se llena cuando alguien aprieta *Actualizar*.
2. **Sincronización manual/`POST /api/inbox/sync`**. Recorre `/{page-id}/feed?fields=comments`, `/{ig-id}/media?fields=comments` y `/{page-id|ig-id}/conversations?fields=messages` de cada cuenta. Cada fuente falla de forma independiente: un permiso faltante aparece como *warning* en el banner, no rompe el resto.

Idempotencia: `InboxMessage.externalId` es único, y la ingesta hace `upsert` con `update: {}`, así que un mismo comentario que llega por webhook y por sync (o dos veces por reintentos de Meta) se guarda una sola vez y no se pierde el `isRead`. `InboxThread.lastMessageAt` nunca retrocede.

Los mensajes propios se detectan comparando el autor con la cuenta: en Facebook `from.id === pageId`; en Instagram el autor se compara por `username` (la API de comentarios de IG no expone el id del autor). Los `OUTBOUND` nacen como leídos, así que no inflan el contador.

### Configurar el webhook en Meta (una vez por app de cliente)

1. Definir `META_WEBHOOK_VERIFY_TOKEN` en el entorno (cadena larga y aleatoria) y redeployar.
2. En la app de Meta del cliente -> **Webhooks** -> *Page* (y *Instagram* si la cuenta está suscripta a ese objeto):
   - **Callback URL**: `https://<tu-dominio>/api/webhooks/meta`
   - **Verify token**: el mismo valor de `META_WEBHOOK_VERIFY_TOKEN`
3. Suscribir los campos `feed`, `messages`, `comments`, `mentions`, `message_reactions`, `live_comments`. La lista vive en `WEBHOOK_FIELDS` (`src/lib/inbox.ts`) y `GET /api/inbox/setup` muestra cuáles faltan por cuenta.
4. La **suscripción de la Página** a la app la hace el propio código: al guardar Páginas en `/connections` se llama `POST /{page-id}/subscribed_apps` con todos los campos. Si Meta rechaza alguno, se reintenta sin ese campo para que `feed` y `messages` sobrevivan, y el aviso queda en `webhookWarnings` de la respuesta. `POST /api/inbox/sync` también la reintenta.

**Verificación de firma multi-tenant**: cada tenant tiene su propia app de Meta. El `POST` del webhook busca el `SocialProfile` por `entry.id`, descifra el `fbAppSecret` de **ese** tenant (`src/lib/crypto.ts`) y valida `X-Hub-Signature-256` con HMAC-SHA256 en tiempo constante. Si la firma no coincide se descarta la entrada. El endpoint **siempre responde 200** (Meta deshabilita el webhook ante cualquier otro código): los errores se loguean y se saltea la entrada.

La ruta es pública: `src/proxy.ts` sólo matchea páginas (excluye `api`), así que no hay que agregarla a `PUBLIC_PATHS`.

### Requisitos y límites

- Los permisos de Meta ya incluyen `pages_read_user_content`, `pages_messaging`, `pages_manage_engagement`, `instagram_manage_comments` e `instagram_manage_messages`. **Si conectaste las cuentas antes de este cambio hay que volver a conectar Facebook**, porque el token guardado no los tiene.
- En modo *Development* la app sólo recibe eventos de usuarios con rol en ella (igual que el resto del flujo).
- Los **mensajes directos** se pueden responder sólo dentro de la ventana de 24 h que impone la API de mensajería de Meta; después hay que usar una etiqueta de mensaje o esperar al siguiente mensaje del usuario. La UI permite escribir igual y el error de Meta queda visible.
- En Instagram responder un comentario requiere `instagram_manage_comments`; borrar el hilo en la UI es **local** (no borra nada en Meta).
- Los shapes de payload de webhook y el endpoint de conversaciones de Instagram están implementados según la documentación de la Graph API pero no se pudieron probar contra cuentas reales en todas sus variantes; por eso cada fuente degrada a *warning*.

## Despliegue (Docker / Coolify)

El repo incluye un `Dockerfile` multi-stage (Node 20 Alpine) que:

1. instala dependencias con `npm ci` (incluye dev deps para `prisma generate`),
2. compila la app con `npm run build`,
3. copia a la imagen final `.next`, `public`, `prisma`, `scripts` y `next.config.ts`,
4. en el arranque ejecuta `npx prisma migrate deploy && npm start` en el puerto `3000`.

> La carpeta `scripts` **debe** copiarse a la imagen final: sin ella `npm run db:bootstrap` falla con `Cannot find module '/app/scripts/bootstrap-admin.mjs'`.

La publicación automática funciona sin configurar nada extra (scheduler interno cada 60 s). Si preferís un cron externo, desactivá el interno con `SCHEDULER_ENABLED=false` y creá una **Scheduled Task** en Coolify:

```
curl -fsS -X POST -H "Authorization: ******" http://<host-interno>:3000/api/cron/publish
```

Programala cada minuto (o cada 5). La respuesta JSON informa `published`, `retried`, `failed` y `skipped`.

### Runbook de despliegue en Coolify

1. Recurso **Application -> Dockerfile** apuntando al repo (rama `main`), puerto `3000`, dominio `metricool.pixeldesarrollo.com` con HTTPS.
2. Cargar las variables de entorno antes del primer deploy:

   ```
   DATABASE_URL=postgresql://...        # Railway (usar la URL pública/proxy)
   NEXTAUTH_URL=https://metricool.pixeldesarrollo.com
   NEXTAUTH_SECRET=<openssl rand -base64 32>   # no rotar
   APP_ENCRYPTION_KEY=<32 bytes en hex>        # no rotar
   ADMIN_EMAIL=<email del dueño>
   ADMIN_PASSWORD=<mínimo 8 caracteres>
   ADMIN_NAME=<nombre visible>
   SCHEDULER_ENABLED=true
   META_WEBHOOK_VERIFY_TOKEN=<cadena larga y aleatoria>   # webhook del Inbox
   ```

   `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` **ya no se usan** (cada tenant tiene su propia app) y `CRON_SECRET` sólo hace falta si se usa el cron externo.

   Para generar la clave de cifrado:

   ```powershell
   $b = New-Object byte[] 32
   (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
   -join ($b | ForEach-Object { $_.ToString('x2') })
   ```

3. **Deploy**. El arranque aplica las migraciones pendientes (`prisma migrate deploy`); en el primer deploy sobre la base vieja la migración `20261107130000_multi_tenant` crea el tenant `principal`, pasa los usuarios existentes a `ADMIN` y asigna `tenantId` a los perfiles y posts existentes. No se pierde información.
4. Una sola vez, en **Coolify -> Terminal** del contenedor:

   ```bash
   npm run db:bootstrap
   ```

   Es idempotente: crea el ADMIN o le resetea la contraseña y el rol. Si el terminal sigue mostrando la instancia anterior, cerrarlo y reabrirlo después del deploy.
5. Verificación mínima:
   - `GET /api/auth/providers` devuelve **sólo** `credentials`.
   - `/login` responde 200 y `/connections` sin sesión redirige a `/login?callbackUrl=...`.
   - Login con `ADMIN_EMAIL` -> `/admin` lista la cuenta *principal* -> se le cargan App ID/Secret -> `/connections` conecta Facebook, importa Páginas e Instagram -> se crea y publica un post.

### Alta de un cliente nuevo (checklist)

1. En Meta for Developers, crear la app del cliente (tipo *Business*) y agregar el producto *Facebook Login*.
2. En *Facebook Login -> Settings -> Valid OAuth Redirect URIs*: `https://metricool.pixeldesarrollo.com/api/connect/facebook/callback`.
3. En *App Settings -> Basic*: Privacy Policy `https://metricool.pixeldesarrollo.com/privacy`, Data Deletion `https://metricool.pixeldesarrollo.com/data-deletion`, ícono PNG **sin canal alfa**. En *Terms of Service* no hay página propia todavía: repetir la URL de `/privacy` o crear `/terms` (el proxy ya la tiene como ruta pública).
4. En `/admin` -> *Crear cuenta*: nombre, email, contraseña, App ID y App Secret. (Si más adelante cambia el secret, se actualiza con el botón de credenciales de esa tarjeta.)
5. Si la cuenta va a usar el **Inbox**: configurar el webhook en la app del cliente (ver [Configurar el webhook en Meta](#configurar-el-webhook-en-meta-una-vez-por-app-de-cliente)) después de conectar las Páginas.
6. Enviar al cliente la URL de login y sus credenciales. Con la app en modo *Development* necesita figurar como Administrador/Desarrollador/Tester de la app; si no, hay que publicarla (ver *Pasar la app de un cliente a producción*).

## Problemas conocidos y soluciones

Casos reales encontrados durante el despliegue y la puesta en marcha:

| Síntoma | Causa | Solución |
| --- | --- | --- |
| Coolify: `ERROR: Repository not found` / `Could not read from remote repository` | La deploy key del recurso no tiene acceso a ese repositorio (o se reutilizó una key de otra app). | Usar una key propia del recurso o una GitHub App con acceso al repo. |
| `P3005 The database schema is not empty` al desplegar | La base tenía tablas sin historial de migraciones (creadas con `db push`). | Hacer *baseline* con `prisma migrate resolve --applied <migración>` o, si los datos no importan, vaciar la base. **Nunca** borrar tablas en producción sin confirmar. |
| `Cannot find module '/app/scripts/bootstrap-admin.mjs'` | La imagen final no incluía `scripts/`. | Copiar `scripts` en el `Dockerfile` (ya corregido en `aed1de7`). |
| Meta rechaza el ícono de la app | El PNG tenía canal alfa (`colorType=6`). | Exportarlo en truecolor sin alfa (`colorType=2`). El archivo bueno es `public/app-icon-1024.png`. |
| Al importar sólo aparecen algunas Páginas de Facebook | El diálogo de Login autoriza Página por Página y/o el token es anterior a los permisos actuales. | Ver *Páginas que no aparecen al importar*. |
| Instagram no muestra cuentas | No hay cuentas Business/Creator vinculadas a las Páginas **ya conectadas**, o falta `instagram_basic`. | Conectar primero la Página en `/connections` y reconectar Facebook para autorizar el permiso. |
| "Se produjo un error. Actualiza la página o cierra y vuelve a abrir la ventana del navegador" al subir una imagen | Es un error genérico del SDK de Facebook dentro del modal de publicación. | Recargar y reintentar; si persiste, revisar la consola del navegador y los scopes del token. |
| El **Inbox** no recibe nada | Falta configurar el webhook, o el token guardado es anterior a los permisos de mensajería. | Definir `META_WEBHOOK_VERIFY_TOKEN`, cargar la Callback URL y el Verify token en la app de Meta, y reconectar Facebook para autorizar `pages_messaging` / `pages_read_user_content` / `instagram_manage_*`. Mientras tanto se puede forzar con *Actualizar*. |
| `GET /api/webhooks/meta` devuelve 500 | `META_WEBHOOK_VERIFY_TOKEN` no está definida en el entorno. | Cargarla y redeployar; el setup en `/inbox` -> *Webhooks* lo muestra como `verifyTokenConfigured: false`. |
| Llegan comentarios pero no mensajes directos (o al revés) | Permisos parciales en el token o campos no suscriptos en la Página. | Revisar `GET /api/inbox/setup` (qué campos faltan por cuenta) y el banner de `POST /api/inbox/sync`. |

## Notas de desarrollo (Next.js 16 / ESLint)

Cosas que no son obvias y conviene recordar antes de tocar el código:

- **No hay `middleware.ts`**: el guard de sesión vive en `src/proxy.ts` (función exportada `proxy`, `config.matcher`, runtime Node por defecto). Las rutas públicas están en `PUBLIC_PATHS`.
- **`cookies()` es asíncrono** (`await cookies()`) en route handlers.
- **`useSearchParams()` exige un `<Suspense>`** alrededor del componente que lo usa, si no el build falla. En este repo se resuelve con un wrapper: `LoginPage` / `ConnectionsPage`.
- **Regla `react-hooks/set-state-in-effect`** (error en Next 16): detecta `setState` de forma transitiva a través de funciones llamadas desde el cuerpo del `useEffect`. Patrones usados para evitarla: derivar estado en render en lugar de sincronizarlo, y diferir el fetch inicial con `queueMicrotask(...)` (ver `src/app/admin/page.tsx`).
- **`User` no tiene `createdAt`**: cualquier `orderBy`/`select` sobre `User` debe usar `name`; usar `createdAt` rompe los tipos de Prisma con un error confuso.
- **El `tenantId` sale siempre del JWT**, nunca del body; `/api/facebook/save-pages` y `/api/instagram/save-accounts` revalidan contra la Graph API antes de guardar.
- El scheduler interno (`src/instrumentation.ts`) publica para **todos** los tenants; se apaga con `SCHEDULER_ENABLED=false` y no corre durante el build.

Validación local antes de pushear:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Hitos del proyecto

| Commit | Qué agregó |
| --- | --- |
| `c095bdd` | Ícono de app y favicons. |
| `9992524` | Paginación completa de Páginas, Business Portfolio y aviso de permisos faltantes. |
| `d147457` | Arquitectura multi-tenant: login propio, credenciales de Meta por cliente, OAuth por tenant, panel `/admin`, Instagram derivado de las Páginas. |
| `aed1de7` | Copia de `scripts/` a la imagen final para poder correr `db:bootstrap` en el contenedor. |
| `4f6230b` | Subida de imágenes y videos (varios por publicación) y elección entre Publicación e Historia. |
| `e93845d` | Calendario: vistas Día/Semana/Mes, filtros funcionales y fix del botón «Nuevo post» del topbar. |
| Inbox | Modelos `InboxThread`/`InboxMessage`, webhook de Meta con verificación HMAC multi-tenant, sync manual, respuestas y bandeja real en `/inbox`. |

## Pendientes

- `/smartlink` (constructor de link-in-bio) sigue siendo una maqueta sin persistencia.
- Inbox: probar el webhook con eventos reales de Meta (comentarios y DMs de Facebook e Instagram) y ajustar los shapes si difieren. Las respuestas todavía son sólo de texto (sin adjuntos).
- Crear la página `/terms` si Meta la exige (el proxy ya la trata como pública).
- Rotar la contraseña de PostgreSQL de Railway: circuló en texto plano durante la puesta en marcha.
- Al conectar cuentas de Instagram de clientes, probar el flujo completo de publicación (hasta ahora validado sólo con la cuenta del dueño).
