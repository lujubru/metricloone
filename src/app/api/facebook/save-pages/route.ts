import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();
    const { selectedPages } = body;

    if (!selectedPages || !Array.isArray(selectedPages)) {
      return NextResponse.json({ error: "Formato de datos inválido" }, { status: 400 });
    }

    const savedProfiles = [];

    // Guardar o actualizar cada página seleccionada en nuestra tabla SocialProfile
    for (const page of selectedPages) {
      const profile = await prisma.socialProfile.upsert({
        where: {
          platform_profileId: {
            platform: "facebook_page",
            profileId: page.id,
          },
        },
        update: {
          username: page.name,
          accessToken: page.access_token, // Importante: Este es el token ESPECÍFICO de la página
          updatedAt: new Date(),
        },
        create: {
          userId: userId,
          platform: "facebook_page",
          profileId: page.id,
          username: page.name,
          accessToken: page.access_token,
        },
      });
      savedProfiles.push(profile);
    }

    return NextResponse.json({ success: true, savedCount: savedProfiles.length });
  } catch (error) {
    console.error("Error al guardar las páginas:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
