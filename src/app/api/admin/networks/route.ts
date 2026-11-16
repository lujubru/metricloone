import { NextResponse } from "next/server";
import { requireAdmin, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * El "pool" de redes del administrador: todo lo que ya vinculó con su propia
 * cuenta de Facebook desde /connections. Los clientes no tienen redes propias,
 * sólo permisos sobre estas, así que acá se listan para poder asignarlas.
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const [connection, profiles] = await Promise.all([
      prisma.fbConnection.findUnique({ where: { tenantId: auth.tenantId } }),
      prisma.socialProfile.findMany({
        where: { tenantId: auth.tenantId },
        select: {
          id: true,
          platform: true,
          profileId: true,
          username: true,
          parentProfileId: true,
        },
        orderBy: [{ platform: "asc" }, { username: "asc" }],
      }),
    ]);

    return NextResponse.json({
      connected: Boolean(connection),
      facebook: connection
        ? { fbUserName: connection.fbUserName, tokenExpiresAt: connection.tokenExpiresAt }
        : null,
      profiles,
    });
  } catch (error) {
    console.error("Error al leer las redes del administrador:", error);
    return serverError("No se pudieron leer tus redes vinculadas");
  }
}
