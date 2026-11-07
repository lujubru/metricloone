import { NextResponse } from "next/server";
import { requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const { id } = await context.params;

    const profile = await prisma.socialProfile.findFirst({
      where: { id, tenantId: auth.tenantId },
    });

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    await prisma.socialProfile.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al desconectar el perfil:", error);
    return serverError();
  }
}
