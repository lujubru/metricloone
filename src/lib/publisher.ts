import { prisma } from "./prisma";
import { FacebookApiError, publishToFacebookPage } from "./facebook";
import { INSTAGRAM_PLATFORM, publishToInstagram } from "./instagram";

/** Intentos totales antes de marcar el post como FAILED definitivo. */
const MAX_ATTEMPTS = 3;
/** Un post en PUBLISHING más antiguo que esto se considera abandonado (proceso caído). */
const STALE_LOCK_MS = 10 * 60 * 1000;
const BATCH_SIZE = 20;
const MAX_ERROR_LENGTH = 900;

export type PublishRunResult = {
  processed: number;
  published: number;
  retried: number;
  failed: number;
  skipped: number;
  errors: { postId: string; error: string }[];
};

export type PublishOutcome = {
  status: "PUBLISHED" | "SCHEDULED" | "FAILED";
  errorMessage: string | null;
};

type PublishablePost = {
  id: string;
  content: string;
  mediaUrls: string[];
  postType: string;
  attempts: number;
  socialProfile: {
    platform: string;
    profileId: string;
    accessToken: string;
  };
};

class PublishFailure extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "PublishFailure";
    this.retryable = retryable;
  }
}

function isRetryable(error: unknown) {
  if (error instanceof FacebookApiError) return error.retryable;
  if (error instanceof PublishFailure) return error.retryable;
  // Errores desconocidos (red, DB) se reintentan hasta agotar MAX_ATTEMPTS.
  return true;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

async function send(post: PublishablePost) {
  const { platform, profileId, accessToken } = post.socialProfile;

  if (platform === "facebook_page") {
    return publishToFacebookPage({
      pageId: profileId,
      accessToken,
      message: post.content,
      mediaUrls: post.mediaUrls,
      postType: post.postType,
    });
  }

  if (platform === INSTAGRAM_PLATFORM) {
    return publishToInstagram({
      igUserId: profileId,
      accessToken,
      caption: post.content,
      mediaUrls: post.mediaUrls,
      postType: post.postType,
    });
  }

  throw new PublishFailure(
    `La plataforma "${platform}" no soporta publicación automática todavía.`,
    false
  );
}

/**
 * Reclama el post de forma atómica (SCHEDULED -> PUBLISHING) para que dos
 * workers nunca publiquen el mismo post, lo envía a Facebook y registra el resultado.
 * Devuelve null si otro proceso ya lo tomó.
 */
async function attemptPublish(post: PublishablePost): Promise<PublishOutcome | null> {
  const claim = await prisma.post.updateMany({
    where: { id: post.id, status: "SCHEDULED" },
    data: { status: "PUBLISHING" },
  });

  if (claim.count === 0) return null;

  try {
    const { externalPostId } = await send(post);

    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        facebookPostId: externalPostId,
        errorMessage: null,
        attempts: post.attempts + 1,
      },
    });

    return { status: "PUBLISHED", errorMessage: null };
  } catch (error) {
    const message = errorMessage(error);
    const attempts = post.attempts + 1;
    const willRetry = isRetryable(error) && attempts < MAX_ATTEMPTS;

    await prisma.post.update({
      where: { id: post.id },
      data: {
        // Se deja SCHEDULED para reintentar en el siguiente ciclo.
        status: willRetry ? "SCHEDULED" : "FAILED",
        attempts,
        errorMessage: message,
      },
    });

    console.error(
      `[publisher] Post ${post.id} falló (intento ${attempts}/${MAX_ATTEMPTS}): ${message}`
    );

    return { status: willRetry ? "SCHEDULED" : "FAILED", errorMessage: message };
  }
}

/**
 * Publica los posts programados cuya hora ya pasó. Es idempotente: puede
 * ejecutarse en paralelo sin duplicar publicaciones.
 */
export async function publishDuePosts(now = new Date()): Promise<PublishRunResult> {
  const result: PublishRunResult = {
    processed: 0,
    published: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Recupera posts que quedaron bloqueados por un reinicio/caída del servidor.
  await prisma.post.updateMany({
    where: { status: "PUBLISHING", updatedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    data: { status: "SCHEDULED" },
  });

  const duePosts = await prisma.post.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    include: { socialProfile: true },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_SIZE,
  });

  for (const post of duePosts) {
    const outcome = await attemptPublish(post);

    if (!outcome) {
      result.skipped += 1;
      continue;
    }

    result.processed += 1;

    if (outcome.status === "PUBLISHED") result.published += 1;
    else if (outcome.status === "SCHEDULED") result.retried += 1;
    else {
      result.failed += 1;
      result.errors.push({ postId: post.id, error: outcome.errorMessage || "Error desconocido" });
    }
  }

  return result;
}

/**
 * Publica un post concreto de una cuenta (botón "Publicar ahora" / reintento manual).
 * Solo acepta posts en DRAFT, SCHEDULED o FAILED que no estén ya publicándose.
 */
export async function publishPostById(
  postId: string,
  tenantId: string
): Promise<PublishOutcome | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId },
    include: { socialProfile: true },
  });

  if (!post) return null;

  const claim = await prisma.post.updateMany({
    where: { id: postId, tenantId, status: { in: ["SCHEDULED", "DRAFT", "FAILED"] } },
    data: { status: "SCHEDULED", attempts: post.status === "FAILED" ? 0 : post.attempts },
  });

  if (claim.count === 0) return null;

  // Un reintento manual arranca el contador de intentos de cero.
  return attemptPublish({
    id: post.id,
    content: post.content,
    mediaUrls: post.mediaUrls,
    postType: post.postType,
    attempts: post.status === "FAILED" ? 0 : post.attempts,
    socialProfile: post.socialProfile,
  });
}
