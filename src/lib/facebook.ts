const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v23.0";
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

type GraphResponse<T> = T & { error?: GraphError };

export class FacebookApiError extends Error {
  code?: number;
  status: number;
  retryable: boolean;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "FacebookApiError";
    this.status = status;
    this.code = code;
    this.retryable = FacebookApiError.isRetryable(status, code);
  }

  // Errores de token/permisos (190, 100, 200) no se solucionan reintentando.
  private static isRetryable(status: number, code?: number) {
    if (code === 190 || code === 100 || code === 200 || code === 10) return false;
    if (code === 4 || code === 17 || code === 32 || code === 613) return true;
    return status >= 500 || status === 429;
  }
}

async function graphRequest<T>(path: string, body?: Record<string, string>): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${GRAPH_BASE_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body: body ? new URLSearchParams(body).toString() : undefined,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de red";
    throw new FacebookApiError(`No se pudo contactar la API de Facebook: ${message}`, 503);
  }

  let data: GraphResponse<T>;
  try {
    data = (await res.json()) as GraphResponse<T>;
  } catch {
    throw new FacebookApiError(`Respuesta inválida de Facebook (HTTP ${res.status})`, res.status);
  }

  if (!res.ok || data.error) {
    throw new FacebookApiError(
      data.error?.message || `Facebook respondió HTTP ${res.status}`,
      res.status,
      data.error?.code
    );
  }

  return data;
}

export type PublishInput = {
  pageId: string;
  accessToken: string;
  message: string;
  mediaUrls: string[];
};

/**
 * Publica en una Página de Facebook. Sin media usa /feed, con una imagen usa
 * /photos y con varias sube fotos no publicadas y las adjunta al feed.
 */
export async function publishToFacebookPage({
  pageId,
  accessToken,
  message,
  mediaUrls,
}: PublishInput): Promise<{ externalPostId: string }> {
  const media = mediaUrls.filter((url) => /^https?:\/\//i.test(url));

  if (media.length === 0) {
    const data = await graphRequest<{ id: string }>(`/${pageId}/feed`, {
      message,
      access_token: accessToken,
    });
    return { externalPostId: data.id };
  }

  if (media.length === 1) {
    const data = await graphRequest<{ id: string; post_id?: string }>(`/${pageId}/photos`, {
      url: media[0],
      caption: message,
      access_token: accessToken,
    });
    return { externalPostId: data.post_id || data.id };
  }

  const mediaIds: string[] = [];
  for (const url of media) {
    const photo = await graphRequest<{ id: string }>(`/${pageId}/photos`, {
      url,
      published: "false",
      access_token: accessToken,
    });
    mediaIds.push(photo.id);
  }

  const data = await graphRequest<{ id: string }>(`/${pageId}/feed`, {
    message,
    access_token: accessToken,
    attached_media: JSON.stringify(mediaIds.map((id) => ({ media_fbid: id }))),
  });

  return { externalPostId: data.id };
}
