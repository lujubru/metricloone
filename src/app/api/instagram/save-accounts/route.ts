import { NextResponse } from "next/server";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { FacebookApiError } from "@/lib/facebook";
import { INSTAGRAM_PLATFORM, listInstagramAccounts } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const body = await req.json();
    const { selectedAccounts } = body as { selectedAccounts?: string[] };

    if (!Array.isArray(selectedAccounts) || selectedAccounts.length === 0) {
      return badRequest("Formato de datos inválido");
    }

    const connection = await prisma.fbConnection.findUnique({
      where: { tenantId: auth.tenantId },
    });
    if (!connection?.userAccessToken) {
      return NextResponse.json({ error: "Conectá Facebook primero" }, { status: 404 });
    }

    const pages = await prisma.socialProfile.findMany({
      where: { tenantId: auth.tenantId, platform: "facebook_page" },
      select: { profileId: true },
    });

    // Solo se ofrecen cuentas de IG de Páginas ya conectadas, y el token de
    // página se resuelve en el servidor (nunca se confía en el cliente).
    const accounts = await listInstagramAccounts(
      connection.userAccessToken,
      pages.map((page) => page.profileId)
    );
    const selected = accounts.filter((account) => selectedAccounts.includes(account.id));

    if (selected.length === 0) {
      return badRequest("Ninguna de las cuentas seleccionadas está disponible");
    }

    let savedCount = 0;

    for (const account of selected) {
      await prisma.socialProfile.upsert({
        where: {
          tenantId_platform_profileId: {
            tenantId: auth.tenantId,
            platform: INSTAGRAM_PLATFORM,
            profileId: account.id,
          },
        },
        update: {
          userId: auth.user.id,
          username: account.username,
          accessToken: account.pageAccessToken,
          parentProfileId: account.pageId,
          updatedAt: new Date(),
        },
        create: {
          tenantId: auth.tenantId,
          userId: auth.user.id,
          platform: INSTAGRAM_PLATFORM,
          profileId: account.id,
          username: account.username,
          accessToken: account.pageAccessToken,
          parentProfileId: account.pageId,
        },
      });
      savedCount += 1;
    }

    return NextResponse.json({ success: true, savedCount });
  } catch (error) {
    if (error instanceof FacebookApiError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error al guardar las cuentas de Instagram:", error);
    return serverError();
  }
}
