import { NextResponse } from "next/server";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { FacebookApiError } from "@/lib/facebook";
import { DIRECTION_OUTBOUND, sendInboxReply } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Responde en el hilo: DM para mensajes directos o respuesta pública al comentario. */
export async function POST(req: Request, context: Context) {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;
  const { tenantId } = auth;
  const { id } = await context.params;

  let body = "";
  try {
    const payload = (await req.json()) as { body?: unknown };
    body = typeof payload?.body === "string" ? payload.body.trim() : "";
  } catch {
    return badRequest("Falta el texto de la respuesta");
  }

  if (!body) return badRequest("Escribí el texto de la respuesta");

  try {
    const { externalId } = await sendInboxReply({ threadId: id, tenantId, body });
    const remoteCreatedAt = new Date();

    await prisma.$transaction([
      // El eco del webhook puede llegar antes que esta respuesta: el upsert
      // evita chocar con el `externalId` único.
      prisma.inboxMessage.upsert({
        where: { externalId },
        update: {},
        create: {
          threadId: id,
          externalId,
          direction: DIRECTION_OUTBOUND,
          authorName: null,
          body,
          isRead: true,
          remoteCreatedAt,
        },
      }),
      prisma.inboxThread.update({ where: { id }, data: { lastMessageAt: remoteCreatedAt } }),
    ]);

    return NextResponse.json({ ok: true, externalId });
  } catch (error) {
    if (error instanceof FacebookApiError) {
      console.error("Meta rechazó la respuesta:", error.message);
      return badRequest(error.message);
    }
    console.error("Error al responder en el inbox:", error);
    return serverError("No se pudo enviar la respuesta");
  }
}
