import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireTenant, serverError } from "@/lib/api";
import { DIRECTION_INBOUND } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Hilos del tenant con su último mensaje y el conteo de no leídos. */
export async function GET(req: Request) {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;
  const { tenantId } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");
    const kind = searchParams.get("kind");
    const unreadOnly = searchParams.get("unread") === "1";
    const limit = Math.min(Number(searchParams.get("limit") ?? 60) || 60, 200);

    const where: Prisma.InboxThreadWhereInput = { tenantId };
    if (platform) where.platform = platform;
    if (kind) where.kind = kind;
    if (unreadOnly) where.messages = { some: { isRead: false, direction: DIRECTION_INBOUND } };

    const [threads, unreadTotal, profiles] = await Promise.all([
      prisma.inboxThread.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        take: limit,
        include: {
          messages: { orderBy: { remoteCreatedAt: "desc" }, take: 1 },
          socialProfile: { select: { id: true, platform: true, username: true, profileId: true } },
          _count: { select: { messages: { where: { isRead: false, direction: DIRECTION_INBOUND } } } },
        },
      }),
      prisma.inboxMessage.count({
        where: { isRead: false, direction: DIRECTION_INBOUND, thread: { tenantId } },
      }),
      prisma.socialProfile.findMany({
        where: { tenantId },
        select: { id: true, platform: true, username: true, profileId: true },
        orderBy: { platform: "asc" },
      }),
    ]);

    return NextResponse.json({
      unreadTotal,
      profiles,
      threads: threads.map((thread) => ({
        id: thread.id,
        platform: thread.platform,
        kind: thread.kind,
        subject: thread.subject,
        permalink: thread.permalink,
        participantName: thread.participantName,
        participantAvatar: thread.participantAvatar,
        lastMessageAt: thread.lastMessageAt,
        unread: thread._count.messages,
        account: thread.socialProfile.username ?? thread.socialProfile.profileId,
        lastMessage: thread.messages[0]
          ? {
              id: thread.messages[0].id,
              direction: thread.messages[0].direction,
              body: thread.messages[0].body,
              createdAt: thread.messages[0].remoteCreatedAt,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Error al listar el inbox:", error);
    return serverError("No se pudo cargar la bandeja de entrada");
  }
}
