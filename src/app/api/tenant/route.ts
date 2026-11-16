import { NextResponse } from "next/server";
import { requireTenant, serverError } from "@/lib/api";
import { platformAppCredentials } from "@/lib/facebook-oauth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Estado de la cuenta del usuario logueado (credenciales y conexión de Facebook). */
export async function GET() {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        fbAppId: true,
        fbAppSecret: true,
        fbConnection: {
          select: { fbUserId: true, fbUserName: true, tokenExpiresAt: true, updatedAt: true },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        fbAppId: platformAppCredentials()?.appId ?? tenant.fbAppId,
        // Basta con que haya credenciales de la plataforma o las propias del cliente.
        hasCredentials:
          platformAppCredentials() !== null || Boolean(tenant.fbAppId && tenant.fbAppSecret),
        facebook: tenant.fbConnection,
      },
      user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role },
    });
  } catch (error) {
    console.error("Error al obtener la cuenta:", error);
    return serverError();
  }
}
