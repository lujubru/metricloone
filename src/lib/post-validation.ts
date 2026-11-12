import { INSTAGRAM_PLATFORM } from "./instagram";
import {
  MAX_MEDIA_ITEMS,
  MAX_STORY_MEDIA_ITEMS,
  POST_TYPE_POST,
  POST_TYPE_STORY,
  normalizeMediaUrls,
  type PostType,
} from "./media";

export type PostPayload = {
  content: string;
  mediaUrls: string[];
  postType: PostType;
};

export function parsePostType(value: unknown): PostType {
  return value === POST_TYPE_STORY ? POST_TYPE_STORY : POST_TYPE_POST;
}

/**
 * Reglas compartidas por POST y PATCH de /api/posts.
 * Devuelve `{ error }` con el mensaje para el usuario o `{ value }` ya limpio.
 */
export function validatePostPayload({
  content,
  mediaUrls,
  postType,
  platform,
  req,
}: {
  content: unknown;
  mediaUrls: unknown;
  postType: unknown;
  platform: string | null;
  req?: Request;
}): { error: string } | { value: PostPayload } {
  const type = parsePostType(postType);
  const isStory = type === POST_TYPE_STORY;
  const cleanContent = typeof content === "string" ? content.trim() : "";
  const cleanMediaUrls = normalizeMediaUrls(mediaUrls, req);

  if (isStory) {
    if (platform && platform !== INSTAGRAM_PLATFORM) {
      return { error: "Las Historias sólo se pueden publicar en Instagram." };
    }

    if (cleanMediaUrls.length !== MAX_STORY_MEDIA_ITEMS) {
      return { error: "Una Historia necesita exactamente una imagen o un video." };
    }

    return { value: { content: cleanContent, mediaUrls: cleanMediaUrls, postType: type } };
  }

  if (!cleanContent) return { error: "El contenido es obligatorio" };

  if (cleanMediaUrls.length > MAX_MEDIA_ITEMS) {
    return { error: `Podés adjuntar hasta ${MAX_MEDIA_ITEMS} archivos por publicación.` };
  }

  if (platform === INSTAGRAM_PLATFORM && cleanMediaUrls.length === 0) {
    return { error: "Instagram requiere al menos una imagen o video." };
  }

  return { value: { content: cleanContent, mediaUrls: cleanMediaUrls, postType: type } };
}
