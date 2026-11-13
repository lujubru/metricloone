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

/**
 * Rango de relación de aspecto (ancho / alto) que acepta Instagram en el feed.
 * Fuera de él la API responde «The aspect ratio is not supported».
 */
export const INSTAGRAM_MIN_ASPECT_RATIO = 4 / 5;
export const INSTAGRAM_MAX_ASPECT_RATIO = 1.91;

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

/** Igual que `isOwnMediaUrl`, pero también reconoce URLs absolutas. */
export function isAppMediaUrl(url: string) {
  try {
    return new URL(url, "http://localhost").pathname.startsWith("/api/media/");
  } catch {
    return false;
  }
}

/** true si el feed de Instagram acepta esa relación de aspecto. */
export function isSupportedInstagramFeedRatio(ratio: number) {
  return ratio >= INSTAGRAM_MIN_ASPECT_RATIO && ratio <= INSTAGRAM_MAX_ASPECT_RATIO;
}

export type CropRect = { left: number; top: number; width: number; height: number };

/**
 * Área a recortar (centrada) para que la imagen entre en el rango que acepta
 * Instagram. Devuelve `null` si la relación de aspecto ya es válida.
 */
export function instagramFeedCrop(
  width?: number | null,
  height?: number | null
): CropRect | null {
  if (!width || !height) return null;

  const ratio = width / height;
  if (isSupportedInstagramFeedRatio(ratio)) return null;

  if (ratio > INSTAGRAM_MAX_ASPECT_RATIO) {
    const targetWidth = Math.min(width, Math.floor(height * INSTAGRAM_MAX_ASPECT_RATIO));
    return { left: Math.floor((width - targetWidth) / 2), top: 0, width: targetWidth, height };
  }

  const targetHeight = Math.min(height, Math.floor(width / INSTAGRAM_MIN_ASPECT_RATIO));
  return { left: 0, top: Math.floor((height - targetHeight) / 2), width, height: targetHeight };
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
