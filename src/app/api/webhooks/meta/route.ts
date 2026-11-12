import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import {
  DIRECTION_INBOUND,
  DIRECTION_OUTBOUND,
  FACEBOOK_PLATFORM,
  type InboxAttachment,
  THREAD_KIND_COMMENT,
  THREAD_KIND_MESSAGE,
  ingestInboxMessage,
  verifyWebhookSignature,
} from "@/lib/inbox";
import { INSTAGRAM_PLATFORM } from "@/lib/instagram";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Verificación del webhook: Meta hace un GET con `hub.challenge` y el token que
 * se configuró en el panel de la app.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!expected) {
    console.error("Falta META_WEBHOOK_VERIFY_TOKEN: el webhook de Meta no puede verificarse.");
    return new NextResponse("Webhook no configurado", { status: 500 });
  }

  if (mode === "subscribe" && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Verificación inválida", { status: 403 });
}

type ChangeValue = {
  item?: string;
  verb?: string;
  comment_id?: string;
  post_id?: string;
  parent_id?: string;
  message?: string;
  from?: { id?: string; name?: string; username?: string };
  created_time?: number | string;
  permalink_url?: string;
  id?: string;
  text?: string;
  timestamp?: string;
  media?: { id?: string };
};

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
};

type WebhookEntry = {
  id: string;
  time?: number;
  changes?: { field?: string; value?: ChangeValue }[];
  messaging?: MessagingEvent[];
};

type WebhookPayload = {
  object?: string;
  entry?: WebhookEntry[];
};

function toDate(value: number | string | undefined): Date {
  if (typeof value === "number") {
    // Meta manda segundos en unos eventos y milisegundos en otros.
    return new Date(value > 1e12 ? value : value * 1000);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function attachmentsOf(
  attachments: { type?: string; payload?: { url?: string } }[] | undefined
): InboxAttachment[] | null {
  const mapped = (attachments ?? [])
    .map((item) => ({ type: item.type || "file", url: item.payload?.url || "" }))
    .filter((item) => Boolean(item.url));
  return mapped.length ? mapped : null;
}

/**
 * Receptor de webhooks de Meta. Un mismo callback sirve para todas las cuentas:
 * el `entry.id` identifica la Página o la cuenta de Instagram y de ahí se deduce
 * el tenant (y con él el App Secret que firma el payload).
 */
export async function POST(req: Request) {
  const raw = await req.text();

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  // Cache por tenant: el payload puede traer varias entradas de la misma cuenta.
  const secrets = new Map<string, string | null>();

  for (const entry of payload.entry ?? []) {
    if (!entry.id) continue;

    const platform = payload.object === "instagram" ? INSTAGRAM_PLATFORM : FACEBOOK_PLATFORM;
    const profile = await prisma.socialProfile.findFirst({
      where: { platform, profileId: entry.id },
      include: { tenant: { select: { id: true, fbAppSecret: true } } },
    });

    if (!profile) {
      // Cuenta desconocida (o desconectada): se acepta el evento y se descarta.
      console.warn(`Webhook de Meta para una cuenta desconocida: ${platform}/${entry.id}`);
      continue;
    }

    let secret = secrets.get(profile.tenantId);
    if (secret === undefined) {
      try {
        secret = profile.tenant.fbAppSecret ? decryptSecret(profile.tenant.fbAppSecret) : null;
      } catch (error) {
        console.error("No se pudo descifrar el App Secret del tenant:", error);
        secret = null;
      }
      secrets.set(profile.tenantId, secret);
    }

    if (!secret) {
      console.error(`El tenant ${profile.tenantId} no tiene App Secret: no se puede validar la firma.`);
      continue;
    }

    if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
      console.error(`Firma inválida para el webhook de ${platform}/${entry.id}`);
      continue;
    }

    try {
      await processEntry(entry, {
        tenantId: profile.tenantId,
        socialProfileId: profile.id,
        platform,
        pageOrAccountId: profile.profileId,
        ownUsername: profile.username,
      });
    } catch (error) {
      console.error("Error al procesar el webhook de Meta:", error);
    }
  }

  // Meta reintenta ante cualquier respuesta distinta de 200 y termina
  // deshabilitando el webhook, así que se confirma la recepción siempre.
  return NextResponse.json({ received: true });
}

type EntryContext = {
  tenantId: string;
  socialProfileId: string;
  platform: string;
  pageOrAccountId: string;
  ownUsername: string | null;
};

async function processEntry(entry: WebhookEntry, ctx: EntryContext) {
  const base = {
    tenantId: ctx.tenantId,
    socialProfileId: ctx.socialProfileId,
    platform: ctx.platform,
  };

  for (const change of entry.changes ?? []) {
    const value = change.value;
    if (!value) continue;

    const isPageFeed = change.field === "feed" && value.item === "comment";
    const isIgComment = change.field === "comments";
    if (!isPageFeed && !isIgComment) continue;
    if (value.verb && value.verb !== "add") continue;

    const commentId = isIgComment ? value.id : value.comment_id;
    const threadId = isIgComment ? value.media?.id : value.post_id;
    if (!commentId || !threadId) continue;

    const authorName = isIgComment ? value.from?.username : value.from?.name;
    const isOwn = isIgComment
      ? Boolean(ctx.ownUsername) && value.from?.username === ctx.ownUsername
      : value.from?.id === ctx.pageOrAccountId;

    await ingestInboxMessage({
      ...base,
      kind: THREAD_KIND_COMMENT,
      externalThreadId: threadId,
      permalink: value.permalink_url ?? null,
      participantName: isOwn ? null : authorName ?? null,
      participantExternalId: value.from?.id ?? null,
      message: {
        externalId: commentId,
        direction: isOwn ? DIRECTION_OUTBOUND : DIRECTION_INBOUND,
        authorName: authorName ?? null,
        authorExternalId: value.from?.id ?? null,
        body: (isIgComment ? value.text : value.message) ?? "",
        permalink: value.permalink_url ?? null,
        remoteCreatedAt: toDate(isIgComment ? value.timestamp : value.created_time),
      },
    });
  }

  for (const event of entry.messaging ?? []) {
    const message = event.message;
    if (!message?.mid) continue;
    // Los acuses de lectura y las reacciones no son mensajes.
    if (!message.text && !message.attachments?.length) continue;

    const isEcho = Boolean(message.is_echo);
    const otherPartyId = isEcho ? event.recipient?.id : event.sender?.id;
    if (!otherPartyId) continue;

    await ingestInboxMessage({
      ...base,
      kind: THREAD_KIND_MESSAGE,
      externalThreadId: otherPartyId,
      participantExternalId: otherPartyId,
      message: {
        externalId: message.mid,
        direction: isEcho ? DIRECTION_OUTBOUND : DIRECTION_INBOUND,
        body: message.text ?? "",
        attachments: attachmentsOf(message.attachments),
        remoteCreatedAt: toDate(event.timestamp),
      },
    });
  }
}
