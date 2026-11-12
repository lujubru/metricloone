import { NextResponse } from "next/server";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Conversación completa de un hilo. */
export async function GET(_req: Request, context: Context) {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;
  const { tenantId } = auth;
  const { id } = await context.params;

  try {
    const thread = await prisma.inboxThread.findFirst({
      where: { id, tenantId },
      include: {
        socialProfile: { select: { id: true, platform: true, username: true, profileId: true } },
        messages: { orderBy: { remoteCreatedAt: "asc" } },
      },
    });

    if (!thread) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

    return NextResponse.json({
      thread: {
        id: thread.id,
        platform: thread.platform,
        kind: thread.kind,
        subject: thread.subject,
        permalink: thread.permalink,
        participantName: thread.participantName,
        participantAvatar: thread.participantAvatar,
        participantExternalId: thread.participantExternalId,
        account: thread.socialProfile.username ?? thread.socialProfile.profileId,
        messages: thread.messages.map((message) => ({
          id: message.id,
          direction: message.direction,
          authorName: message.authorName,
          body: message.body,
          attachments: message.attachments ?? null,
          permalink: message.permalink,
          isRead: message.isRead,
          createdAt: message.remoteCreatedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error al cargar la conversación:", error);
    return serverError("No se pudo cargar la conversación");
  }
}

/** Marca el hilo como leído (o como no leído si `isRead` es false). */
export async function PATCH(req: Request, context: Context) {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;
  const { tenantId } = auth;
  const { id } = await context.params;

  let isRead = true;
  try {
    const body = (await req.json()) as { isRead?: unknown };
    if (typeof body?.isRead === "boolean") isRead = body.isRead;
  } catch {
    // Sin cuerpo: se asume marcar como leído.
  }

  try {
    const thread = await prisma.inboxThread.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!thread) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

    await prisma.inboxMessage.updateMany({ where: { threadId: id }, data: { isRead } });
    return NextResponse.json({ ok: true, isRead });
  } catch (error) {
    console.error("Error al actualizar el estado de lectura:", error);
    return serverError("No se pudo actualizar la conversación");
  }
}

/** Elimina el hilo del inbox local (no borra nada en la red social). */
export async function DELETE(_req: Request, context: Context) {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;
  const { tenantId } = auth;
  const { id } = await context.params;

  try {
    const result = await prisma.inboxThread.deleteMany({ where: { id, tenantId } });
    if (!result.count) return badRequest("La conversación no existe");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error al eliminar la conversación:", error);
    return serverError("No se pudo eliminar la conversación");
  }
}
