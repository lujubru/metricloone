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
