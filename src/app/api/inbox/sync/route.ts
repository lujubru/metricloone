import { NextResponse } from "next/server";
import { accessibleProfileIds, requireTenant, serverError } from "@/lib/api";
import { syncTenantInbox } from "@/lib/inbox";

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
    const profileIds = await accessibleProfileIds(auth);
    if (!profileIds.length) {
      return NextResponse.json(
        { error: "Todavía no hay ninguna red vinculada." },
        { status: 400 }
      );
    }

    const summary = await syncTenantInbox(tenantId, profileIds);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error al sincronizar el inbox:", error);
    return serverError("No se pudo sincronizar la bandeja de entrada");
  }
}
