# Sesión: medios subidos, Historias de Instagram y arreglos del calendario

Documento de trabajo de la sesión. Complementa al [README.md](./README.md) (que describe la app en general): acá se registra **qué se pidió, qué se decidió y qué se cambió**, incluyendo el estado de cada cosa.

---

## 1. Pedidos de la sesión

### Pedido 1 — Medios subidos e Historias

> En el calendario donde se crean los posts, las imágenes no deberían ser por URL sino subidas por el usuario. Debe poder haber más de una imagen por post (carrusel de Instagram) y también subida de videos junto a imágenes. Además, debe poder seleccionarse **Post** o **Historia**, porque la idea es automatizar las Historias de Instagram.

### Pedido 2 — Retoques del calendario (este turno)

> Ya está en producción y funcionó. Documentar todo en `sesion.md`. Ahora hay que retocar el calendario: los filtros no funcionan, los botones Día/Semana/Mes tampoco, y el botón "New Post" de arriba queda detrás de otros elementos y no se puede usar (sólo funcionaba el botón interno del calendario).

---

## 2. Decisiones de diseño (Pedido 1)

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Almacenamiento | Archivos en la base (`MediaAsset.data`, `bytea`) | El deploy es un contenedor en Coolify; un volumen local se perdería en cada redeploy. No se quiso depender de un S3 externo. |
| Tamaño máximo | **16 MB por archivo**, máximo **10 archivos** por post | 16 MB cubre fotos de celular; 10 es el límite real de Instagram. |
| Historias | Sólo **Instagram**, exactamente **1** medio | La API de Stories no soporta carrusel ni aplica a Páginas de Facebook. |
| Tipos aceptados | Imágenes `jpeg/png/webp/heic/heif`, videos `mp4/quicktime` | HEIC es el formato por defecto de iPhone; se normaliza a JPEG. |
| Normalización | Las imágenes pasan por `sharp` → JPEG, máx. 2048 px, sin alfa | La API de Instagram sólo acepta JPEG. |
| Tipo de post | `Post.postType` (`POST` \| `STORY`), default `POST` | Compatible con los posts ya existentes (migración sin backfill). |

---

## 3. Modelo de datos

`prisma/schema.prisma`:

```prisma
model Post {
  // ...
  postType   String   @default("POST") // POST | STORY
  mediaUrls  String[]
}

model MediaAsset {
  id        String   @id @default(cuid())
  tenantId  String
  filename  String   // saneado, con extensión (se usa en la URL pública)
  mimeType  String
  kind      String   // IMAGE | VIDEO
  size      Int
  data      Bytes    // el archivo se guarda en la base para sobrevivir a los redeploys
  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}
```

Migración: `prisma/migrations/20261112120000_media_assets_and_stories/migration.sql`.

---

## 4. Módulos nuevos

### `src/lib/media.ts` — fuente única compartida cliente/servidor

No importa Prisma ni `sharp` para poder usarse en el formulario.

- Constantes: `POST_TYPE_POST`, `POST_TYPE_STORY`, `MAX_MEDIA_ITEMS` (10), `MAX_STORY_MEDIA_ITEMS` (1), `MEDIA_MAX_FILE_MB` (16), `MEDIA_MAX_FILE_BYTES`, `MEDIA_ACCEPT_ATTRIBUTE`, listas de MIME aceptados.
- Tipos: `PostType`, `MediaKind`, `UploadedMedia`.
- Helpers: `mediaKindFromMime`, `mediaKindFromFilename` (fallback por extensión), `isHttpUrl`, `isOwnMediaUrl`, `isVideoUrl`, `publicBaseUrl`, `mediaAssetUrl`, `normalizeMediaUrls`, `sanitizeFilename`.

> **Detalle importante:** Meta decide si un medio es video **por la extensión de la URL**, por eso los archivos se sirven como `/api/media/<id>/<archivo>.jpg|.mp4` y no como `/api/media/<id>`.

### `src/lib/post-validation.ts`

- `parsePostType(value)` normaliza a `POST`/`STORY`.
- `validatePostPayload()` aplica las reglas:
  - **Historia**: sólo Instagram, exactamente 1 medio.
  - **Post**: contenido obligatorio (salvo que haya medios), hasta 10 medios, Instagram exige al menos 1 medio.

---

## 5. API

### `POST /api/media`

- `multipart/form-data`, campo `files` (repetible).
- Valida tenant, cantidad de archivos, MIME (con fallback por extensión) y tamaño (16 MB).
- Imágenes → `sharp` (JPEG, máx. 2048 px, `fit: inside`, sin metadatos); videos → tal cual.
- Crea un `MediaAsset` por archivo y responde `201 { media: UploadedMedia[] }`.

### `DELETE /api/media`

- Body `{ ids: string[] }`; borra sólo assets del tenant. Se usa para limpiar medios huérfanos cuando el usuario quita archivos antes de guardar el post.

### `GET` / `HEAD /api/media/[id]/[filename]`

- Público (Meta necesita descargar el archivo para publicar). `src/proxy.ts` excluye `/api` del matcher, por eso no requiere sesión.
- Devuelve `Content-Type`, `Content-Length` y `Cache-Control: public, max-age=31536000, immutable`.

---

## 6. Publicación

- `src/lib/publisher.ts`: propaga `postType` y `mediaUrls` al publicador correspondiente.
- `src/lib/instagram.ts`:
  - **STORY** → contenedor con `media_type=STORIES` + `media_publish`.
  - **POST** → carrusel de imágenes (`is_carousel_item`), video (`media_type=REELS`/`VIDEO`) o combinación, respetando el límite de 10.
- `src/lib/facebook.ts`: soporta varias imágenes/video y **rechaza Historias** (no aplican a Páginas).
- `src/app/api/posts/route.ts` y `[id]/route.ts`: aceptan y validan `postType` + `mediaUrls` con `validatePostPayload()`.

---

## 7. UI

### `src/components/NewPostModal.tsx`

- Selector **Publicación / Historia** (Historias sólo si la cuenta es de Instagram).
- Zona de subida drag & drop + selector de archivos, con barras de progreso y borrado individual/total.
- Previews (imagen y video), contador `n/10` o `1/1`, mensajes de límite y limpieza de medios huérfanos (`DELETE /api/media`) al quitar archivos o cerrar el formulario.

### `src/app/planning/page.tsx`

- Miniaturas de los medios en "Próximos Posts" (`MediaThumbnails`, con ícono de video).
- Chips del calendario en rosa para Historias y azul para Publicaciones.
- Badge de tipo (`Historia` / `Publicación`).

---

## 8. Refactor chico

`src/lib/facebook.ts` duplicaba `isVideoUrl` y el literal `"STORY"`. Ahora importa `POST_TYPE_STORY` e `isVideoUrl` desde `src/lib/media.ts`.

---

## 9. Arreglos del calendario (Pedido 2)

### 9.1 Botón "New Post" que quedaba detrás

**Causa raíz:** `NewPostModal` se montaba **dentro** de `<header class="topbar">`, y `.topbar` tiene `backdrop-filter: blur(8px)`. Un elemento con `backdrop-filter` (o `filter`) se convierte en *containing block* de sus descendientes `position: fixed` y crea su propio *stacking context*; el overlay (`position: fixed; inset: 0; z-index: 100`) terminaba confinado a la franja de ~70 px del header y quedaba tapado por el contenido de la página.

**Solución:** el modal se renderiza en `<body>` con `createPortal` (guarda de SSR con inicialización perezosa de `document.body`). No se tocó el CSS ni la jerarquía del header, así que el diseño global quedó igual y se arreglaron a la vez el botón del topbar y el interno del calendario.

### 9.2 Botones Día / Semana / Mes

Antes eran decorativos (sin `onClick`) y el mes estaba fijo en `new Date()`. Ahora:

- Estado `view: 'month' | 'week' | 'day'` y `cursor: Date` (fecha ancla).
- Botón activo con `btn-primary` y los demás con `btn-secondary` (`aria-pressed`).
- Navegación **‹ / ›** y botón **Hoy**; el desplazamiento depende de la vista (mes / 7 días / 1 día).
- Encabezado según vista: `noviembre de 2026`, rango `10 nov – 16 nov 2026`, o `lunes, 10 de noviembre de 2026`.
- **Mes:** grilla de 42 celdas construida desde `cursor`; el día de hoy resaltado; click en el número del día abre la vista de Día; `+N más` también abre el día.
- **Semana:** grilla de 7 columnas (lunes a domingo) con hora en cada chip.
- **Día:** agenda con hora, contenido, miniaturas, cuenta, tipo y estado.

### 9.3 Filtros

El botón `Filter` no tenía handler. Ahora abre un popover con:

- **Cuenta** (perfil social, derivado de los posts cargados),
- **Tipo** (`Publicaciones` / `Historias`),
- **Estado** (`Borrador`, `Programado`, `Publicando`, `Publicado`, `Fallido`),
- **Limpiar filtros** y contador de filtros activos en el botón.

Los filtros se aplican tanto a la grilla/agenda como a "Próximos Posts"; el popover se cierra al hacer click afuera, con `Escape` (listener de `keydown`) o al limpiar.

### 9.4 Bug de zona horaria

Los posts se agrupaban con `new Date(p.scheduledFor).toISOString().slice(0, 10)` (UTC) mientras las celdas se construían en horario local: en Argentina (UTC-3) un post de las 22:00 aparecía al día siguiente. Ahora se usa una clave local `YYYY-MM-DD` (`dateKey`).

### 9.5 Orden de "Próximos Posts"

Se ordena por `scheduledFor` ascendente (antes llegaba en el orden que devolvía la API).

---

## 10. Validación ejecutada

```bash
npx tsc --noEmit   # OK
npm run lint       # OK (sólo el warning preexistente de @next/next/no-page-custom-font en layout.tsx)
npm run build      # OK
```

Prueba funcional: subida de imágenes y videos, carrusel y publicación de Historias verificadas por el usuario **en producción**.

---

## 11. Estado y pendientes

- ✅ Medios subidos (imágenes + videos), carrusel y Historias de Instagram: **en producción**.
- ✅ Calendario: filtros, vistas Día/Semana/Mes y botón "New Post" del topbar corregidos.
- ⏳ Ideas para más adelante (no pedidas): editar un post existente desde el calendario, arrastrar posts entre días, filtros persistidos en la URL, paginación en "Próximos Posts".
- ⚠️ Gotcha preexistente (fuera de alcance): `GET /api/posts` y `GET /api/profiles` devuelven `accessToken` al cliente; convendría recortarlos.

---

## 12. Redes del administrador asignadas a cada usuario

### 12.1 Pedido

> Quiero modificar la creación de usuarios: en vez de poner la key y demás, estoy levantando los Instagram y Facebook desde el admin con la cuenta que tengo en developers. Lo que quiero es que a cada usuario que cree le seleccione las redes sociales ya vinculadas que quiero que administre; yo levanto la red social del cliente usando mi Facebook y luego le creo un usuario y le asigno.

### 12.2 Decisiones

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Credenciales de Meta | **Globales**, por variables de entorno (`FB_APP_ID` / `FB_APP_SECRET`) | El ADMIN usa una sola app de Meta para todos los clientes; no hay que cargar claves por cuenta. |
| Asignación | **Múltiple**: una red puede estar asignada a varios usuarios | Un cliente puede tener varios operadores sobre la misma Página. |
| App propia del cliente | **Se mantiene** como opción avanzada en la tarjeta de la cuenta | No rompe a quien ya cargó sus credenciales ni bloquea ese flujo. |
| Dónde viven los perfiles | **Una sola vez, en el tenant del ADMIN** (modelo "pool") | Los usuarios arrastran los permisos de la cuenta principal: Meta ve siempre a la misma dueña y el webhook es el mismo. Importar perfiles al cliente sólo duplicaba filas y ambigüedad. |
| Control de acceso | Tabla join `SocialProfileAccess` (`userId` × `socialProfileId`) | Es la única forma de que varios usuarios compartan perfiles sin duplicarlos. |

### 12.3 Modelo de datos

```prisma
model SocialProfileAccess {
  id              String   @id @default(cuid())
  userId          String
  socialProfileId String
  createdAt       DateTime @default(now())

  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  socialProfile SocialProfile @relation(fields: [socialProfileId], references: [id], onDelete: Cascade)

  @@unique([userId, socialProfileId])
  @@index([socialProfileId])
}
```

Migración `prisma/migrations/20261120120000_social_profile_access/migration.sql`: crea la tabla y hace un backfill conservador (todos los usuarios × todos los perfiles de su tenant, `ON CONFLICT DO NOTHING`), así nadie pierde acceso al actualizar. **Ya aplicada** en la base de Railway con `prisma migrate deploy`.

Como los perfiles nunca llegaron a importarse a tenants de clientes, el cambio al modelo pool **no requería migración de datos**: las filas existentes son justamente los accesos de los usuarios ADMIN sobre el pool de "Cuenta principal".

### 12.4 Flujo del ADMIN

1. `/admin` -> **Conectar mi Facebook** (`/api/connect/facebook/start?next=/admin`). El token de usuario queda en `FbConnection` del tenant del ADMIN.
2. `GET /api/admin/networks` descubre sus Páginas e Instagram y los muestra agrupados (Instagram bajo su Página, con seguidores). Es el **pool**: la lista completa de redes disponibles para asignar.
3. **Crear cuenta**: nombre, email, contraseña y selección de redes del pool. `POST /api/admin/tenants` crea el tenant + usuario y guarda los permisos del usuario creado sobre esos perfiles (`socialProfileIds`). No se copia ningún perfil ni token.
4. **Agregar redes nuevas al pool**: se hace una sola vez desde `/connections` con la cuenta del ADMIN (`save-pages` / `save-accounts` hacen el `upsert` del `SocialProfile` y suscriben los webhooks). Ya no hay importación por cuenta.
5. **Asignar redes** por usuario: `PATCH /api/admin/users/[id] { socialProfileIds }` reemplaza los accesos de ese usuario (sólo acepta perfiles del pool del ADMIN).
6. **Credenciales propias** (opcional): si el cliente usa su propia app de Meta, se cargan desde la tarjeta y tienen prioridad sobre las globales (`resolveAppCredentials`).

### 12.5 Pool y accesos

`src/lib/networks.ts`:

- `grantProfileAccess(socialProfileIds, userIds)` -> cantidad de accesos creados.
- `syncProfileAccess({ userId, ownerTenantId, socialProfileIds })` -> reemplaza los accesos del usuario, descartando ids que no pertenezcan al tenant del ADMIN.

`POST /api/admin/networks` y `importNetworks` se eliminaron: los perfiles se crean únicamente en `/connections`, sobre la cuenta del ADMIN.

### 12.6 Filtrado de lectura

`src/lib/api.ts` expone `accessibleProfileWhere(auth)` (para relaciones to-one: `socialProfile: { is: ... }`) y `accessibleProfileIds(auth)` (para listas y `count`):

- **ADMIN** -> `{ tenantId }`: ve todo el pool.
- **CLIENT** -> `{ OR: [{ tenantId }, { access: { some: { userId } } }] }`: ve lo propio y lo que le fue asignado.

Se aplican en: `/api/profiles`, `/api/profiles/[id]`, `/api/posts`, `/api/posts/[id]`, `/api/inbox`, `/api/inbox/[id]`, `/api/inbox/sync` (`syncProfilesInbox(profileIds)`), `/api/inbox/[id]/reply` (`sendInboxReply({ threadId, profileIds, body })`), `/api/analytics/instagram/reels`, `/api/instagram/accounts`, `/api/facebook/save-pages` y `/api/instagram/save-accounts`.

Los `Post` se validan por su propio `tenantId`, así que un post del cliente puede publicarse contra un perfil del pool. Un usuario con sesión válida no puede leer ni publicar en redes que no le fueron asignadas, aunque conozca el `id`.

### 12.7 Variables de entorno

```bash
FB_APP_ID="<app id de Meta del admin>"
FB_APP_SECRET="<app secret>"
```

`platformAppCredentials()` cae a `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` si las nuevas no están definidas. Documentadas en `.env.example` y en el README.

### 12.8 Archivos

- Nuevos: `src/lib/networks.ts` (`grantProfileAccess`, `syncProfileAccess`), `src/app/api/admin/networks/route.ts` (sólo `GET`: el pool), la migración de `SocialProfileAccess`.
- `src/lib/facebook-oauth.ts`: `platformAppCredentials`, `hasPlatformAppCredentials`, `resolveAppCredentials`, `normalizeReturnPath`, `OAUTH_RETURN_PATHS` (`/connections`, `/admin`).
- `/api/connect/facebook/start`: resuelve credenciales por cuenta o plataforma, valida `next` y responde `?error=credentials` si no hay ninguna.
- `/api/webhooks/meta`: valida la firma con el secret del tenant o con el de la plataforma.
- `/admin`: card *Redes vinculadas* (pool + contador + agregar/reconectar), picker de redes del pool al crear la cuenta y *Asignar redes* por usuario.
- `/connections`: los mensajes de error y el banner reflejan que el ADMIN es quien vincula las redes.

### 12.9 Validación ejecutada

```bash
npx prisma migrate deploy   # OK (Railway)
npx prisma generate        # OK
npx tsc --noEmit           # OK
npm run lint               # OK (queda el warning preexistente de layout.tsx)
npm run build              # OK
```

### 12.10 Riesgos y pendientes

- ⚠️ Dos cuentas que compartan la **misma Página** compartirían el inbox de esa red, porque el perfil es único. Con este modelo no ocurre: cada cliente tiene sus propias Páginas dentro del pool.
- ⚠️ El token es siempre el del ADMIN: si vence o se revoca, todas las cuentas dejan de publicar. Se renueva desde *Reconectar* en `/admin` o `/connections`.
- ⏳ Verificación funcional end-to-end (conectar desde `/admin`, crear un cliente, comprobar que sólo ve las redes asignadas en `/connections`, `/planning`, `/posts` e `/inbox`, y publicar) queda a cargo del usuario con cuentas reales de Meta.
