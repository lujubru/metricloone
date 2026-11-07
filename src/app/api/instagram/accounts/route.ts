import { NextResponse } from "next/server";
import { requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { FacebookApiError } from "@/lib/facebook";
import { listInstagramAccounts } from "@/lib/instagram";

export const dynamic = "force-dynamic";

/** Cuentas de Instagram vinculadas a las Páginas de Facebook ya conectadas. */
export async function GET() {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

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

    if (pages.length === 0) {
      return NextResponse.json(
        {
          accounts: [],
          warnings: ["Primero conectá al menos una Página de Facebook para traer su Instagram."],
        },
        { status: 200 }
      );
    }

    const accounts = await listInstagramAccounts(
      connection.userAccessToken,
      pages.map((page) => page.profileId)
    );

    const warnings =
      accounts.length === 0
        ? [
            "Ninguna de las Páginas conectadas tiene una cuenta de Instagram Business vinculada. Vinculá el Instagram en la configuración de la Página de Facebook.",
          ]
        : [];

    return NextResponse.json({ accounts, warnings });
  } catch (error) {
    if (error instanceof FacebookApiError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error al obtener las cuentas de Instagram:", error);
    return serverError();
  }
}
