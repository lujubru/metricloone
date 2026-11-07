import { FacebookApiError, graphRequest, listManagedPages } from "./facebook";

/** Máximo de items que acepta un carrusel de Instagram. */
const MAX_CAROUSEL_ITEMS = 10;
/** Tiempo máximo de espera a que Instagram procese un contenedor (video). */
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const PROCESSING_POLL_MS = 4000;

export const INSTAGRAM_PLATFORM = "instagram_business";

export type InstagramAccount = {
  /** ID del usuario de Instagram (Instagram Business/Creator). */
  id: string;
  username: string;
  profilePictureUrl: string | null;
  followersCount: number | null;
  /** Página de Facebook a la que está vinculada la cuenta. */
  pageId: string;
  pageName: string;
  /** Token de la Página, necesario para publicar en el IG vinculado. */
  pageAccessToken: string;
};

type GraphPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
    followers_count?: number;
  };
};

/**
 * Descubre las cuentas de Instagram Business vinculadas a las Páginas que
 * administra el usuario. Requiere los permisos `instagram_basic` y
 * `pages_show_list` sobre el token de usuario de Facebook.
 */
export async function listInstagramAccounts(userAccessToken: string): Promise<InstagramAccount[]> {
  // Mismas Páginas que usa el conector de Facebook: incluye paginación y
  // Páginas de portafolios comerciales donde puede haber IG vinculado.
  const { pages } = await listManagedPages(
    userAccessToken,
    "id,name,access_token,instagram_business_account{id,username,profile_picture_url,followers_count}"
  );
  const accounts: InstagramAccount[] = [];

  for (const page of pages as GraphPage[]) {
    const ig = page.instagram_business_account;
    if (!ig?.id) continue;

    accounts.push({
      id: ig.id,
      username: ig.username || ig.id,
      profilePictureUrl: ig.profile_picture_url || null,
      followersCount: typeof ig.followers_count === "number" ? ig.followers_count : null,
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
    });
  }

  return accounts;
}

export type InstagramPublishInput = {
  igUserId: string;
  accessToken: string;
  caption: string;
  mediaUrls: string[];
};

function isVideo(url: string) {
  return /\.(mp4|mov|m4v)(\?.*)?$/i.test(url);
}

function isHttp(url: string) {
  return /^https?:\/\//i.test(url);
}

type ContainerStatus = { status_code?: string; status?: string };

/** Espera a que Instagram termine de procesar el contenedor (videos tardan). */
async function waitForContainer(containerId: string, accessToken: string) {
  const deadline = Date.now() + PROCESSING_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const status = await graphRequest<ContainerStatus>(
      `/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    );

    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new FacebookApiError(
        `Instagram no pudo procesar el medio (estado ${status.status_code}).`,
        400,
        100
      );
    }

    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
  }

  throw new FacebookApiError(
    "Instagram tardó demasiado en procesar el medio. Probá de nuevo más tarde.",
    504,
    4
  );
}

async function createContainer(accessToken: string, igUserId: string, body: Record<string, string>) {
  const container = await graphRequest<{ id: string }>(`/${igUserId}/media`, {
    ...body,
    access_token: accessToken,
  });
  return container.id;
}

async function createCarousel(accessToken: string, igUserId: string, media: string[], caption: string) {
  const children: string[] = [];

  for (const url of media) {
    const childBody: Record<string, string> = {
      is_carousel_item: "true",
    };

    if (isVideo(url)) {
      childBody.media_type = "VIDEO";
      childBody.video_url = url;
    } else {
      childBody.image_url = url;
    }

    const childId = await createContainer(accessToken, igUserId, childBody);
    await waitForContainer(childId, accessToken);
    children.push(childId);
  }

  const carouselId = await createContainer(accessToken, igUserId, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption,
  });
  await waitForContainer(carouselId, accessToken);
  return carouselId;
}

/**
 * Publica en una cuenta de Instagram Business: crea el contenedor de medios,
 * espera a que Instagram lo procese y lo publica.
 *
 * Instagram no permite publicaciones sin media, así que el post debe traer al
 * menos una URL pública (JPEG para imagen, MP4/MOV para video).
 */
export async function publishToInstagram({
  igUserId,
  accessToken,
  caption,
  mediaUrls,
}: InstagramPublishInput): Promise<{ externalPostId: string }> {
  const media = mediaUrls.filter(isHttp);

  if (media.length === 0) {
    throw new FacebookApiError(
      "Instagram requiere al menos una imagen o video: agregá la URL pública del medio en el post.",
      400,
      100
    );
  }

  if (media.length > MAX_CAROUSEL_ITEMS) {
    throw new FacebookApiError(
      `Instagram acepta como máximo ${MAX_CAROUSEL_ITEMS} medios por publicación.`,
      400,
      100
    );
  }

  let containerId: string;

  if (media.length === 1) {
    const url = media[0];
    containerId = await createContainer(
      accessToken,
      igUserId,
      isVideo(url)
        ? { media_type: "REELS", video_url: url, caption }
        : { image_url: url, caption }
    );
    await waitForContainer(containerId, accessToken);
  } else {
    containerId = await createCarousel(accessToken, igUserId, media, caption);
  }

  const published = await graphRequest<{ id: string }>(`/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });

  return { externalPostId: published.id };
}
