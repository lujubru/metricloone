/**
 * Utilidades de medios compartidas entre el cliente (formulario de post) y el
 * servidor (subida, publicación). No importa Prisma ni `sharp` para que el
 * formulario pueda usarlas sin arrastrar código de servidor.
 */

export const POST_TYPE_POST = "POST";
export const POST_TYPE_STORY = "STORY";
export type PostType = typeof POST_TYPE_POST | typeof POST_TYPE_STORY;

/** Instagram acepta hasta 10 medios por publicación (carrusel). */
export const MAX_MEDIA_ITEMS = 10;
/** Las Historias de Instagram admiten un único archivo. */
export const MAX_STORY_MEDIA_ITEMS = 1;

/** Límite por archivo. Configurable en el servidor con `MEDIA_MAX_FILE_MB`. */
export const DEFAULT_MAX_FILE_MB = 16;
export const MEDIA_MAX_FILE_MB = DEFAULT_MAX_FILE_MB;
export const MEDIA_MAX_FILE_BYTES = MEDIA_MAX_FILE_MB * 1024 * 1024;

export type MediaKind = "IMAGE" | "VIDEO";

export type UploadedMedia = {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
};

/**
 * Formatos aceptados. Las imágenes se normalizan a JPEG con `sharp` porque la
 * API de Instagram sólo acepta JPEG (y descarta el canal alfa).
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;

export const MEDIA_ACCEPT_ATTRIBUTE = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(",");

export function mediaKindFromMime(mimeType?: string | null): MediaKind | null {
  if (!mimeType) return null;
  if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mimeType)) return "IMAGE";
  if ((ACCEPTED_VIDEO_TYPES as readonly string[]).includes(mimeType)) return "VIDEO";
  return null;
}

/** Fallback por extensión para navegadores que no informan `file.type`. */
export function mediaKindFromFilename(filename: string): MediaKind | null {
  if (/\.(jpe?g|png|webp|heic|heif)$/i.test(filename)) return "IMAGE";
  if (/\.(mp4|mov|m4v)$/i.test(filename)) return "VIDEO";
  return null;
}

export function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

/** Archivos servidos por esta app (`/api/media/<id>/<archivo>`). */
export function isOwnMediaUrl(url: string) {
  return url.startsWith("/api/media/");
}

/**
 * Instagram y Facebook deciden el tipo de medio por la URL, así que los
 * archivos subidos se sirven con su extensión (`/api/media/<id>/foto.jpg`).
 */
export function isVideoUrl(url: string) {
  return /\.(mp4|mov|m4v)(\?.*)?$/i.test(url);
}

/** URL pública absoluta de la app (Meta necesita descargar los medios). */
export function publicBaseUrl(req?: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (req) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "http";
    if (host) return `${proto}://${host}`;
  }

  return "";
}

export function mediaAssetUrl({
  id,
  filename,
  baseUrl,
}: {
  id: string;
  filename: string;
  baseUrl: string;
}) {
  return `${baseUrl}/api/media/${id}/${encodeURIComponent(filename)}`;
}

/**
 * Deja sólo URLs utilizables: absolutas http(s) o rutas propias `/api/media/...`
 * (que se convierten en absolutas con la URL pública de la app).
 */
export function normalizeMediaUrls(input: unknown, req?: Request): string[] {
  if (!Array.isArray(input)) return [];

  const baseUrl = publicBaseUrl(req);

  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => isHttpUrl(item) || isOwnMediaUrl(item))
    .map((item) => (isOwnMediaUrl(item) && baseUrl ? `${baseUrl}${item}` : item))
    .slice(0, MAX_MEDIA_ITEMS);
}

export function sanitizeFilename(name: string, fallback = "archivo") {
  const withoutPath = name.split(/[\\/]/).pop() || fallback;
  const withoutExtension = withoutPath.replace(/\.[^.]+$/, "");
  const slug = withoutExtension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || fallback;
}
