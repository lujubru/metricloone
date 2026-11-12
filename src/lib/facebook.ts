import { POST_TYPE_STORY, isVideoUrl } from "./media";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v23.0";
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

type GraphResponse<T> = T & { error?: GraphError };

/** Permisos que la app pide a Facebook. Se usan también para auditar el token guardado. */
export const FACEBOOK_SCOPES = [
  "email",
  "public_profile",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_read_user_content",
  "pages_messaging",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages",
] as const;

export const FACEBOOK_SCOPE_STRING = FACEBOOK_SCOPES.join(",");

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

export async function graphRequest<T>(path: string, body?: Record<string, string>): Promise<T> {
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

/**
 * Recorre una lista de la Graph API siguiendo `paging.next` hasta agotarla.
 * Sin esto, listas grandes se cortan en la primera página de resultados.
 */
async function graphListAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | undefined = `${GRAPH_BASE_URL}${path}`;
  let hops = 0;

  while (next && hops < 25) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const data = (await res.json()) as {
      data?: T[];
      paging?: { next?: string };
      error?: GraphError;
    };

    if (!res.ok || data.error) {
      throw new FacebookApiError(
        data.error?.message || `Facebook respondió HTTP ${res.status}`,
        res.status,
        data.error?.code
      );
    }

    items.push(...(data.data || []));
    next = data.paging?.next;
    hops += 1;
  }

  return items;
}

export type ManagedPage = {
  id: string;
  name: string;
  category?: string;
  access_token: string;
};

export type PageDiscoveryResult = {
  pages: ManagedPage[];
  warnings: string[];
};

const DEFAULT_PAGE_FIELDS = "id,name,category,access_token";

/**
 * Devuelve todas las Páginas que el usuario puede administrar, uniendo:
 *  - `/me/accounts`: Páginas con rol directo del usuario.
 *  - `/{business}/owned_pages` y `/{business}/client_pages`: Páginas que
 *    pertenecen a un portafolio comercial y a las que se accede a través del
 *    negocio. Estas NO aparecen en `/me/accounts` si no hay rol explícito,
 *    que es la causa típica de "me faltan Páginas".
 */
export async function listManagedPages(
  userAccessToken: string,
  fields: string = DEFAULT_PAGE_FIELDS
): Promise<PageDiscoveryResult> {
  const query = `fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(
    userAccessToken
  )}`;
  const pages = new Map<string, ManagedPage>();
  const warnings: string[] = [];

  for (const page of await graphListAll<ManagedPage>(`/me/accounts?${query}`)) {
    if (page.access_token) pages.set(page.id, page);
  }

  try {
    const businesses = await graphListAll<{ id: string; name: string }>(
      `/me/businesses?fields=id,name&limit=100&access_token=${encodeURIComponent(userAccessToken)}`
    );

    for (const business of businesses) {
      for (const edge of ["owned_pages", "client_pages"]) {
        try {
          const extra = await graphListAll<ManagedPage>(`/${business.id}/${edge}?${query}`);
          for (const page of extra) {
            if (page.access_token && !pages.has(page.id)) pages.set(page.id, page);
          }
        } catch {
          // Sin tareas asignadas sobre las Páginas de ese negocio: se ignora.
        }
      }
    }
  } catch (error) {
    const code = error instanceof FacebookApiError ? error.code : undefined;
    if (code === 10 || code === 100 || code === 200 || code === 190) {
      warnings.push(
        "Esta sesión de Facebook no incluye el permiso business_management, así que no pudimos leer las Páginas de tu portafolio comercial. Cerrá sesión y volvé a entrar con Facebook para concederlo."
      );
    }
  }

  return { pages: [...pages.values()], warnings };
}

/** Permisos que el usuario concedió realmente (no los que la app pidió). */
export async function grantedPermissions(userAccessToken: string): Promise<string[]> {
  const data = await graphListAll<{ permission: string; status: string }>(
    `/me/permissions?access_token=${encodeURIComponent(userAccessToken)}`
  );
  return data.filter((item) => item.status === "granted").map((item) => item.permission);
}

/** URL del diálogo OAuth de la app del cliente. */
export function buildOAuthDialogUrl({
  appId,
  redirectUri,
  state,
  scope = FACEBOOK_SCOPE_STRING,
}: {
  appId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

/** Canjea el `code` del callback por un access token de usuario. */
export async function exchangeCodeForToken({
  appId,
  appSecret,
  redirectUri,
  code,
}: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<TokenResponse> {
  return graphRequest<TokenResponse>("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
}

/**
 * Cambia un token corto por uno de larga duración (60 días). Requiere el App
 * Secret, pero los Page tokens que se derivan después no expiran.
 */
export async function exchangeForLongLivedToken({
  appId,
  appSecret,
  accessToken,
}: {
  appId: string;
  appSecret: string;
  accessToken: string;
}): Promise<TokenResponse> {
  return graphRequest<TokenResponse>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: accessToken,
  });
}

export async function getFacebookUser(accessToken: string): Promise<{ id: string; name?: string }> {
  return graphRequest<{ id: string; name?: string }>(
    `/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
  );
}

export type PublishInput = {
  pageId: string;
  accessToken: string;
  message: string;
  mediaUrls: string[];
  /** `STORY` no está soportado en Páginas de Facebook. */
  postType?: string;
};

/**
 * Publica en una Página de Facebook. Sin media usa /feed, con un único archivo
 * usa /photos o /videos y con varios sube los archivos sin publicar y los
 * adjunta al feed.
 *
 * Las Historias sólo existen en Instagram: en Facebook el post falla con un
 * error no reintentable para no quedar en un bucle de reintentos.
 */
export async function publishToFacebookPage({
  pageId,
  accessToken,
  message,
  mediaUrls,
  postType,
}: PublishInput): Promise<{ externalPostId: string }> {
  if (postType === POST_TYPE_STORY) {
    throw new FacebookApiError(
      "Las Historias sólo se pueden publicar en Instagram. Elegí Instagram o cambiá el tipo a Publicación.",
      400,
      100
    );
  }

  const media = mediaUrls.filter((url) => /^https?:\/\//i.test(url));

  if (media.length === 0) {
    const data = await graphRequest<{ id: string }>(`/${pageId}/feed`, {
      message,
      access_token: accessToken,
    });
    return { externalPostId: data.id };
  }

  if (media.length === 1) {
    const url = media[0];

    if (isVideoUrl(url)) {
      const video = await graphRequest<{ id: string }>(`/${pageId}/videos`, {
        file_url: url,
        description: message,
        access_token: accessToken,
      });
      return { externalPostId: video.id };
    }

    const data = await graphRequest<{ id: string; post_id?: string }>(`/${pageId}/photos`, {
      url,
      caption: message,
      access_token: accessToken,
    });
    return { externalPostId: data.post_id || data.id };
  }

  const mediaIds: string[] = [];
  for (const url of media) {
    if (isVideoUrl(url)) {
      const video = await graphRequest<{ id: string }>(`/${pageId}/videos`, {
        file_url: url,
        published: "false",
        access_token: accessToken,
      });
      mediaIds.push(video.id);
      continue;
    }

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
