import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FacebookApiError } from "@/lib/facebook";
import { INSTAGRAM_PLATFORM, listInstagramAccounts } from "@/lib/instagram";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();
    const { selectedAccounts } = body as { selectedAccounts?: string[] };

    if (!Array.isArray(selectedAccounts) || selectedAccounts.length === 0) {
      return NextResponse.json({ error: "Formato de datos inválido" }, { status: 400 });
    }

    const facebookAccount = await prisma.account.findFirst({
      where: { userId, provider: "facebook" },
    });

    if (!facebookAccount?.access_token) {
      return NextResponse.json({ error: "Cuenta de Facebook no conectada" }, { status: 404 });
    }

    // Re-resolvemos las cuentas para obtener el token de página en el servidor,
    // sin depender de lo que envíe el cliente.
    const accounts = await listInstagramAccounts(facebookAccount.access_token);
    const selected = accounts.filter((account) => selectedAccounts.includes(account.id));

    if (selected.length === 0) {
      return NextResponse.json(
        { error: "Ninguna de las cuentas seleccionadas está disponible" },
        { status: 400 }
      );
    }

    let savedCount = 0;

    for (const account of selected) {
      await prisma.socialProfile.upsert({
        where: {
          platform_profileId: {
            platform: INSTAGRAM_PLATFORM,
            profileId: account.id,
          },
        },
        update: {
          userId,
          username: account.username,
          accessToken: account.pageAccessToken,
          updatedAt: new Date(),
        },
        create: {
          userId,
          platform: INSTAGRAM_PLATFORM,
          profileId: account.id,
          username: account.username,
          accessToken: account.pageAccessToken,
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
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
