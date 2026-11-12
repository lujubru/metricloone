import crypto from "node:crypto";
import { FacebookApiError, GRAPH_BASE_URL, graphRequest } from "./facebook";
import { INSTAGRAM_PLATFORM } from "./instagram";
import { prisma } from "./prisma";

/** Tipo de hilo: comentarios de una publicación o conversación de mensajes directos. */
export const THREAD_KIND_COMMENT = "COMMENT";
export const THREAD_KIND_MESSAGE = "MESSAGE";

export const DIRECTION_INBOUND = "INBOUND";
export const DIRECTION_OUTBOUND = "OUTBOUND";

export const FACEBOOK_PLATFORM = "facebook_page";

/**
 * Campos de webhook que se piden a la Página. El orden importa: si Meta rechaza
 * algún campo se van descartando desde el final, así los más importantes
 * (`feed` y `messages`) sobreviven.
 */
export const WEBHOOK_FIELDS: readonly string[] = [
  "feed",
  "messages",
  "comments",
  "mentions",
  "messaging_postbacks",
  "message_reactions",
  "message_reads",
] as const;

export type InboxAttachment = { type: string; url: string };

export type IngestInput = {
  tenantId: string;
  socialProfileId: string;
  platform: string;
  kind: string;
  /** id del post/media (comentarios) o de la conversación (mensajes). */
  externalThreadId: string;
  subject?: string | null;
  permalink?: string | null;
  participantName?: string | null;
  participantAvatar?: string | null;
  participantExternalId?: string | null;
  message: {
    externalId: string;
    direction: string;
    authorName?: string | null;
    authorExternalId?: string | null;
    body: string;
    attachments?: InboxAttachment[] | null;
    permalink?: string | null;
    remoteCreatedAt: Date;
  };
};

/**
 * Guarda (o actualiza) un hilo con uno de sus mensajes. Es idempotente porque el
 * webhook y la sincronización manual traen los mismos ids externos.
 */
export async function ingestInboxMessage(input: IngestInput) {
  const key = {
    tenantId: input.tenantId,
    platform: input.platform,
    kind: input.kind,
    externalThreadId: input.externalThreadId,
  };

  const existing = await prisma.inboxThread.findUnique({
    where: { tenantId_platform_kind_externalThreadId: key },
  });

  const thread = existing
    ? await prisma.inboxThread.update({
        where: { id: existing.id },
        data: {
          // El webhook puede llegar antes que un sync viejo: nunca retrocedemos.
          lastMessageAt:
            input.message.remoteCreatedAt > existing.lastMessageAt
              ? input.message.remoteCreatedAt
              : existing.lastMessageAt,
          subject: existing.subject ?? input.subject ?? null,
          permalink: existing.permalink ?? input.permalink ?? null,
          participantName: existing.participantName ?? input.participantName ?? null,
          participantAvatar: existing.participantAvatar ?? input.participantAvatar ?? null,
          participantExternalId:
            existing.participantExternalId ?? input.participantExternalId ?? null,
        },
      })
    : await prisma.inboxThread.create({
        data: {
          ...key,
          socialProfileId: input.socialProfileId,
          subject: input.subject ?? null,
          permalink: input.permalink ?? null,
          participantName: input.participantName ?? null,
          participantAvatar: input.participantAvatar ?? null,
          participantExternalId: input.participantExternalId ?? null,
          lastMessageAt: input.message.remoteCreatedAt,
        },
      });

  const message = await prisma.inboxMessage.upsert({
    where: { externalId: input.message.externalId },
    // El mensaje ya existía: no se reescribe para no perder el estado de leído.
    update: {},
    create: {
      threadId: thread.id,
      externalId: input.message.externalId,
      direction: input.message.direction,
      authorName: input.message.authorName ?? null,
      authorExternalId: input.message.authorExternalId ?? null,
      body: input.message.body,
      attachments: input.message.attachments ?? undefined,
      permalink: input.message.permalink ?? null,
      isRead: input.message.direction === DIRECTION_OUTBOUND,
      remoteCreatedAt: input.message.remoteCreatedAt,
    },
  });

  return { thread, message };
}

/** Firma `X-Hub-Signature-256` de Meta: HMAC-SHA256 del cuerpo crudo con el App Secret. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const received = signatureHeader.slice("sha256=".length);
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  if (received.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

type PagedResponse<T> = { data?: T[]; paging?: { next?: string }; error?: { message: string; code?: number } };

/** Recorre una lista de la Graph API siguiendo `paging.next`. */
async function graphGetAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | undefined = `${GRAPH_BASE_URL}${path}`;
  let hops = 0;

  while (next && hops < 15) {
    const res = await fetch(next, { cache: "no-store" });
    const data = (await res.json()) as PagedResponse<T>;

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

function toDate(value: string | number | undefined | null): Date {
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function normalizeAttachments(
  attachments:
    | { data?: { type?: string; payload?: { url?: string } }[] }
    | undefined
    | null
): InboxAttachment[] | null {
  const list = attachments?.data ?? [];
  const mapped = list
    .map((item) => ({
      type: item.type || "file",
      url: item.payload?.url || "",
    }))
    .filter((item) => Boolean(item.url));

  return mapped.length ? mapped : null;
}

export type InboxSyncSummary = {
  threads: number;
  imported: number;
  warnings: string[];
  subscribed: string[];
  skippedSubscription: string[];
};

type ProfileRow = {
  id: string;
  tenantId: string;
  platform: string;
  profileId: string;
  username: string | null;
  accessToken: string;
  parentProfileId: string | null;
};

type FbComment = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  from?: { id?: string; name?: string };
};

type FbPost = {
  id: string;
  message?: string;
  permalink_url?: string;
  comments?: { data?: FbComment[] };
};

type IgComment = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  replies?: { data?: IgComment[] };
};

type IgMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  comments?: { data?: IgComment[] };
};

type ConversationMessage = {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string; username?: string };
  attachments?: { data?: { type?: string; payload?: { url?: string } }[] };
};

type Conversation = {
  id: string;
  updated_time?: string;
  snippet?: string;
  participants?: { data?: { id?: string; name?: string; username?: string; email?: string }[] };
  messages?: { data?: ConversationMessage[] };
};

/** Comentarios de las publicaciones de una Página de Facebook. */
async function syncFacebookComments(profile: ProfileRow, summary: InboxSyncSummary) {
  const fields =
    "id,message,permalink_url,comments.limit(25){id,message,created_time,permalink_url,from}";
  const posts = await graphGetAll<FbPost>(
    `/${profile.profileId}/feed?limit=15&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(
      profile.accessToken
    )}`
  );

  for (const post of posts) {
    const comments = post.comments?.data ?? [];
    for (const comment of comments) {
      if (!comment.id) continue;

      const isOwn = comment.from?.id === profile.profileId;
      await ingestInboxMessage({
        tenantId: profile.tenantId,
        socialProfileId: profile.id,
        platform: FACEBOOK_PLATFORM,
        kind: THREAD_KIND_COMMENT,
        externalThreadId: post.id,
        subject: post.message?.slice(0, 300) ?? null,
        permalink: post.permalink_url ?? null,
        participantName: comment.from?.name ?? null,
        participantExternalId: comment.from?.id ?? null,
        message: {
          externalId: comment.id,
          direction: isOwn ? DIRECTION_OUTBOUND : DIRECTION_INBOUND,
          authorName: comment.from?.name ?? null,
          authorExternalId: comment.from?.id ?? null,
          body: comment.message ?? "",
          permalink: comment.permalink_url ?? null,
          remoteCreatedAt: toDate(comment.created_time),
        },
      });
      summary.imported += 1;
    }
  }

  summary.threads += posts.filter((post) => (post.comments?.data ?? []).length > 0).length;
}

/** Comentarios (y respuestas) de las publicaciones de una cuenta de Instagram. */
async function syncInstagramComments(profile: ProfileRow, summary: InboxSyncSummary) {
  const fields = "id,caption,permalink,comments.limit(25){id,text,username,timestamp,replies.limit(25){id,text,username,timestamp}}";
  const media = await graphGetAll<IgMedia>(
    `/${profile.profileId}/media?limit=15&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(
      profile.accessToken
    )}`
  );

  const ingestComment = async (thread: IgMedia, comment: IgComment) => {
    if (!comment.id) return;
    const isOwn = Boolean(profile.username) && comment.username === profile.username;

    await ingestInboxMessage({
      tenantId: profile.tenantId,
      socialProfileId: profile.id,
      platform: INSTAGRAM_PLATFORM,
      kind: THREAD_KIND_COMMENT,
      externalThreadId: thread.id,
      subject: thread.caption?.slice(0, 300) ?? null,
      permalink: thread.permalink ?? null,
      participantName: isOwn ? null : comment.username ?? null,
      message: {
        externalId: comment.id,
        direction: isOwn ? DIRECTION_OUTBOUND : DIRECTION_INBOUND,
        authorName: comment.username ?? null,
        body: comment.text ?? "",
        remoteCreatedAt: toDate(comment.timestamp),
      },
    });
    summary.imported += 1;
  };

  for (const item of media) {
    for (const comment of item.comments?.data ?? []) {
      await ingestComment(item, comment);
      for (const reply of comment.replies?.data ?? []) {
        await ingestComment(item, reply);
      }
    }
  }

  summary.threads += media.filter((item) => (item.comments?.data ?? []).length > 0).length;
}

/** Mensajes directos de una Página de Facebook. */
async function syncFacebookMessages(profile: ProfileRow, summary: InboxSyncSummary) {
  const fields =
    "id,updated_time,snippet,participants,messages.limit(25){id,message,created_time,from,attachments}";
  const conversations = await graphGetAll<Conversation>(
    `/${profile.profileId}/conversations?limit=10&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(
      profile.accessToken
    )}`
  );

  await ingestConversations(profile, conversations, FACEBOOK_PLATFORM, summary);
}

/** Mensajes directos de una cuenta de Instagram (se leen con el token de la Página). */
async function syncInstagramMessages(profile: ProfileRow, summary: InboxSyncSummary) {
  const fields =
    "id,updated_time,participants,messages.limit(25){id,message,created_time,from,attachments}";
  const query = `limit=10&platform=instagram&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(
    profile.accessToken
  )}`;

  let conversations: Conversation[];
  try {
    conversations = await graphGetAll<Conversation>(`/${profile.profileId}/conversations?${query}`);
  } catch (error) {
    // Las conversaciones de IG se pueden leer también desde la Página vinculada.
    if (!profile.parentProfileId) throw error;
    conversations = await graphGetAll<Conversation>(
      `/${profile.parentProfileId}/conversations?${query}`
    );
  }

  await ingestConversations(profile, conversations, INSTAGRAM_PLATFORM, summary);
}

async function ingestConversations(
  profile: ProfileRow,
  conversations: Conversation[],
  platform: string,
  summary: InboxSyncSummary
) {
  for (const conversation of conversations) {
    const participant = conversation.participants?.data?.find(
      (item) => item.id && item.id !== profile.profileId
    );

    // Se usa el id del interlocutor como clave del hilo (y no el id interno de
    // la conversación) para que el hilo que crea el webhook —que sólo conoce el
    // PSID/IGSID del remitente— caiga en el mismo registro que el del sync.
    const externalThreadId = participant?.id ?? conversation.id;

    for (const message of conversation.messages?.data ?? []) {
      if (!message.id) continue;
      // En Instagram el `from.id` de las conversaciones no siempre es el id de
      // la cuenta, así que se compara también por username cuando existe.
      const isOwn =
        message.from?.id === profile.profileId ||
        (Boolean(profile.username) && message.from?.username === profile.username);

      await ingestInboxMessage({
        tenantId: profile.tenantId,
        socialProfileId: profile.id,
        platform,
        kind: THREAD_KIND_MESSAGE,
        externalThreadId,
        subject: conversation.snippet ?? null,
        participantName: participant?.name ?? participant?.username ?? null,
        participantExternalId: participant?.id ?? null,
        message: {
          externalId: message.id,
          direction: isOwn ? DIRECTION_OUTBOUND : DIRECTION_INBOUND,
          authorName: message.from?.name ?? message.from?.username ?? null,
          authorExternalId: message.from?.id ?? null,
          body: message.message ?? "",
          attachments: normalizeAttachments(message.attachments),
          remoteCreatedAt: toDate(message.created_time),
        },
      });
      summary.imported += 1;
    }

    if ((conversation.messages?.data ?? []).length > 0) summary.threads += 1;
  }
}

/**
 * Suscribe la app del tenant a los webhooks de una Página. Si Meta rechaza un
 * campo concreto se reintenta sin él, así un campo no soportado por la versión
 * de la API no deja la cuenta sin notificaciones. Un problema de permisos o de
 * token no se arregla recortando campos: se propaga el mensaje original de Meta
 * para que el diagnóstico diga la causa real.
 */
export async function subscribePageWebhooks(
  pageId: string,
  accessToken: string
): Promise<{ subscribed: string[]; rejected: string[] }> {
  const rejected: string[] = [];
  let fields = [...WEBHOOK_FIELDS];
  let lastFieldError: string | null = null;

  while (fields.length > 0) {
    try {
      await graphRequest<{ success?: boolean }>(`/${pageId}/subscribed_apps`, {
        subscribed_fields: fields.join(","),
        access_token: accessToken,
      });
      return { subscribed: fields, rejected };
    } catch (error) {
      // code 100 = campo desconocido o inválido para esta versión de la API.
      // Cualquier otro (10/190/200 = permisos o token) afecta a todos por igual.
      const isFieldError =
        error instanceof FacebookApiError && error.code === 100 && !error.retryable;
      if (!isFieldError) throw error;

      lastFieldError = error.message;
      rejected.unshift(fields[fields.length - 1]);
      fields = fields.slice(0, -1);
    }
  }

  throw new FacebookApiError(
    `Meta rechazó todos los campos de webhook${lastFieldError ? `: ${lastFieldError}` : "."}`,
    400
  );
}

/**
 * Trae comentarios y mensajes de todas las cuentas conectadas del tenant.
 * Cada fuente falla de forma independiente: un permiso faltante se informa como
 * advertencia en lugar de romper la sincronización completa.
 */
export async function syncTenantInbox(tenantId: string): Promise<InboxSyncSummary> {
  const summary: InboxSyncSummary = {
    threads: 0,
    imported: 0,
    warnings: [],
    subscribed: [],
    skippedSubscription: [],
  };

  const profiles = await prisma.socialProfile.findMany({
    where: { tenantId },
    select: {
      id: true,
      tenantId: true,
      platform: true,
      profileId: true,
      username: true,
      accessToken: true,
      parentProfileId: true,
    },
  });

  if (profiles.length === 0) {
    summary.warnings.push("No hay cuentas conectadas: conectá una Página o cuenta de Instagram primero.");
    return summary;
  }

  const pages = profiles.filter((profile) => profile.platform === FACEBOOK_PLATFORM);

  for (const page of pages) {
    try {
      const result = await subscribePageWebhooks(page.profileId, page.accessToken);
      summary.subscribed.push(...result.subscribed);
      if (result.rejected.length) {
        summary.warnings.push(
          `Meta no aceptó los webhooks ${result.rejected.join(", ")} en ${page.username ?? page.profileId}.`
        );
      }
    } catch (error) {
      summary.skippedSubscription.push(page.username ?? page.profileId);
      summary.warnings.push(
        `No se pudieron activar los webhooks de ${page.username ?? page.profileId}: ${
          error instanceof Error ? error.message : "error desconocido"
        }`
      );
    }
  }

  const sources: { label: string; run: (profile: ProfileRow) => Promise<void> }[] = [
    { label: "comentarios de Facebook", run: (profile) => syncFacebookComments(profile, summary) },
    { label: "comentarios de Instagram", run: (profile) => syncInstagramComments(profile, summary) },
    { label: "mensajes de Facebook", run: (profile) => syncFacebookMessages(profile, summary) },
    { label: "mensajes de Instagram", run: (profile) => syncInstagramMessages(profile, summary) },
  ];

  for (const profile of profiles) {
    const applicable = sources.filter((source) =>
      profile.platform === INSTAGRAM_PLATFORM
        ? source.label.includes("Instagram")
        : source.label.includes("Facebook")
    );

    for (const source of applicable) {
      try {
        await source.run(profile);
      } catch (error) {
        const name = profile.username ?? profile.profileId;
        const message = error instanceof Error ? error.message : "error desconocido";
        summary.warnings.push(`No se pudieron leer los ${source.label} de ${name}: ${message}`);
      }
    }
  }

  return summary;
}

/** Responde en un hilo: mensaje directo o comentario, según corresponda. */
export async function sendInboxReply({
  threadId,
  tenantId,
  body,
}: {
  threadId: string;
  tenantId: string;
  body: string;
}): Promise<{ externalId: string }> {
  const thread = await prisma.inboxThread.findFirst({
    where: { id: threadId, tenantId },
    include: { socialProfile: true },
  });

  if (!thread) throw new FacebookApiError("Conversación no encontrada", 404);
  if (!thread.socialProfile) throw new FacebookApiError("La cuenta ya no está conectada", 400);

  const token = thread.socialProfile.accessToken;

  if (thread.kind === THREAD_KIND_MESSAGE) {
    if (!thread.participantExternalId) {
      throw new FacebookApiError(
        "No tenemos el identificador del contacto para responder. Actualizá la bandeja.",
        400
      );
    }

    let lastError: FacebookApiError | null = null;

    // Los DM se mandan contra la cuenta dueña del token; en Instagram con token
    // de Página el id válido puede ser el de la Página y no el de la cuenta, así
    // que se prueban ambos. Un 100 significa "objeto inválido para esta ruta".
    for (const target of parentCandidates(thread.socialProfile)) {
      try {
        const data = await graphRequest<{ message_id?: string }>(`/${target}/messages`, {
          recipient: JSON.stringify({ id: thread.participantExternalId }),
          messaging_type: "RESPONSE",
          message: JSON.stringify({ text: body }),
          access_token: token,
        });

        return { externalId: data.message_id || `local_${crypto.randomUUID()}` };
      } catch (error) {
        if (!(error instanceof FacebookApiError)) throw error;
        lastError = error;
        // Permisos (10/190/200) o ventana de 24 h no se arreglan cambiando de id.
        if (error.code !== 100) break;
      }
    }

    throw describeReplyError(lastError!);
  }

  const target = await prisma.inboxMessage.findFirst({
    where: { threadId: thread.id, direction: DIRECTION_INBOUND },
    orderBy: { remoteCreatedAt: "desc" },
  });

  if (!target) {
    throw new FacebookApiError("No hay un comentario para responder en esta publicación.", 400);
  }

  // Facebook responde con `/comments`; Instagram con `/replies`. Se prueban en
  // el orden que corresponde a la plataforma y se cae al otro ante un 100.
  const paths =
    thread.platform === INSTAGRAM_PLATFORM
      ? [`/${target.externalId}/replies`, `/${target.externalId}/comments`]
      : [`/${target.externalId}/comments`, `/${target.externalId}/replies`];

  let lastError: FacebookApiError | null = null;

  for (const path of paths) {
    try {
      const data = await graphRequest<{ id: string }>(path, {
        message: body,
        access_token: token,
      });
      return { externalId: data.id };
    } catch (error) {
      if (!(error instanceof FacebookApiError)) throw error;
      lastError = error;
      if (error.code !== 100) break;
    }
  }

  throw describeReplyError(lastError!);
}

/** Ids con los que se puede enviar: la cuenta y su Página vinculada, sin repetir. */
function parentCandidates(profile: {
  profileId: string;
  parentProfileId: string | null;
}): string[] {
  const ids = [profile.profileId];
  if (profile.parentProfileId && profile.parentProfileId !== profile.profileId) {
    ids.push(profile.parentProfileId);
  }
  return ids;
}

/** Traduce los rechazos más comunes de Meta a algo accionable en la UI. */
function describeReplyError(error: FacebookApiError): FacebookApiError {
  const message = error.message;

  if (/outside (of )?(the )?allowed window|24 ?hour/i.test(message)) {
    return new FacebookApiError(
      "Meta sólo permite responder dentro de las 24 h posteriores al último mensaje del contacto.",
      error.status,
      error.code
    );
  }

  if (/does not have an appropriate role/i.test(message)) {
    return new FacebookApiError(
      `La cuenta conectada no tiene rol sobre la Página: ${message}`,
      error.status,
      error.code
    );
  }

  return error;
}
