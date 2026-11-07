import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FacebookApiError } from "@/lib/facebook";
import { listInstagramAccounts } from "@/lib/instagram";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const facebookAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "facebook" },
    });

    if (!facebookAccount?.access_token) {
      return NextResponse.json({ error: "Cuenta de Facebook no conectada" }, { status: 404 });
    }

    const accounts = await listInstagramAccounts(facebookAccount.access_token);

    // El token de página nunca se envía al cliente: se resuelve de nuevo al guardar.
    return NextResponse.json({
      accounts: accounts.map((account) => ({
        id: account.id,
        username: account.username,
        profilePictureUrl: account.profilePictureUrl,
        followersCount: account.followersCount,
        pageId: account.pageId,
        pageName: account.pageName,
      })),
    });
  } catch (error) {
    if (error instanceof FacebookApiError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error al obtener las cuentas de Instagram:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
