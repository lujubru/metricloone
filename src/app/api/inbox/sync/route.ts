import { NextResponse } from "next/server";
import { requireTenant, serverError } from "@/lib/api";
import { syncTenantInbox } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Trae comentarios y mensajes que se hayan perdido (por ejemplo porque el
 * webhook todavía no estaba configurado) y suscribe las Páginas a los webhooks.
 */
export async function POST() {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;
  const { tenantId } = auth;

  try {
    const profiles = await prisma.socialProfile.count({ where: { tenantId } });
    if (!profiles) {
      return NextResponse.json(
        { error: "Todavía no hay ninguna red vinculada." },
        { status: 400 }
      );
    }

    const summary = await syncTenantInbox(tenantId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error al sincronizar el inbox:", error);
    return serverError("No se pudo sincronizar la bandeja de entrada");
  }
}
