import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Buscar la conexión de Facebook del usuario en la base de datos
    const facebookAccount = await prisma.account.findFirst({
      where: {
        userId: userId,
        provider: "facebook",
      },
    });

    if (!facebookAccount || !facebookAccount.access_token) {
      return NextResponse.json({ error: "Cuenta de Facebook no conectada" }, { status: 404 });
    }

    // Llamar a la API Graph de Facebook para obtener las páginas administradas
    const response = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${facebookAccount.access_token}`);
    const data = await response.json();

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    // Devuelve la lista de páginas de Facebook (con sus id, name y access_token específicos de página)
    return NextResponse.json({ pages: data.data });
  } catch (error) {
    console.error("Error al obtener las páginas de FB:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
