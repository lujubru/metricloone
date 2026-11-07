import { NextResponse } from "next/server";
import { badRequest, forbidden, requireAdmin, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Actualiza el nombre y/o las credenciales de la app de Facebook de una cuenta. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const data: {
      name?: string;
      fbAppId?: string | null;
      fbAppSecret?: string | null;
    } = {};

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) return badRequest("El nombre no puede quedar vacío");
      data.name = name;
    }

    // `fbAppId`/`fbAppSecret` en `null` o "" limpian el valor guardado.
    const wantsCredentials =
      Object.prototype.hasOwnProperty.call(body ?? {}, "fbAppId") ||
      Object.prototype.hasOwnProperty.call(body ?? {}, "fbAppSecret");

    if (wantsCredentials) {
      const fbAppId = typeof body?.fbAppId === "string" ? body.fbAppId.trim() : "";
      const rawSecret = typeof body?.fbAppSecret === "string" ? body.fbAppSecret.trim() : "";

      if (!fbAppId && !rawSecret) {
        data.fbAppId = null;
        data.fbAppSecret = null;
      } else {
        if (!fbAppId) return badRequest("Falta el App ID");
        // Si el admin no reescribe el secret, conservamos el existente.
        const secret = rawSecret
          ? encryptSecret(rawSecret)
          : tenant.fbAppSecret
            ? tenant.fbAppSecret
            : null;
        if (!secret) return badRequest("Falta el App Secret");
        data.fbAppId = fbAppId;
        data.fbAppSecret = secret;
      }

      const credentialsChanged =
        data.fbAppId !== tenant.fbAppId ||
        (rawSecret
          ? !tenant.fbAppSecret || decryptSecret(tenant.fbAppSecret) !== rawSecret
          : false);

      // Cambiar de app invalida el token vigente: el usuario debe reconectar.
      if (credentialsChanged) {
        await prisma.fbConnection.deleteMany({ where: { tenantId: id } });
      }
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data,
      select: { id: true, name: true, fbAppId: true, fbAppSecret: true },
    });

    return NextResponse.json({
      success: true,
      tenant: {
        id: updated.id,
        name: updated.name,
        fbAppId: updated.fbAppId,
        hasAppSecret: Boolean(updated.fbAppSecret),
      },
    });
  } catch (error) {
    console.error("Error al actualizar la cuenta:", error);
    return serverError();
  }
}

/** Elimina una cuenta con todos sus datos (usuarios, páginas y posts). */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const { id } = await params;
    if (id === auth.tenantId) return forbidden("No podés eliminar tu propia cuenta");

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

    await prisma.tenant.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar la cuenta:", error);
    return serverError();
  }
}
