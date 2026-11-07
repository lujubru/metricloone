import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INSTAGRAM_PLATFORM } from "@/lib/instagram";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    const posts = await prisma.post.findMany({
      where: { userId },
      include: { socialProfile: true },
      orderBy: { scheduledFor: "asc" },
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Error al obtener los posts:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();
    const { content, scheduledFor, socialProfileId, mediaUrls } = body || {};

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "El contenido es obligatorio" }, { status: 400 });
    }

    if (!socialProfileId) {
      return NextResponse.json({ error: "Debes seleccionar un perfil" }, { status: 400 });
    }

    if (!scheduledFor || isNaN(new Date(scheduledFor).getTime())) {
      return NextResponse.json({ error: "La fecha de programación es inválida" }, { status: 400 });
    }

    // Verificar que el perfil pertenece al usuario
    const profile = await prisma.socialProfile.findFirst({
      where: { id: socialProfileId, userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const cleanMediaUrls = Array.isArray(mediaUrls)
      ? mediaUrls.filter(
          (m: unknown): m is string => typeof m === "string" && /^https?:\/\//i.test(m)
        )
      : [];

    // Instagram no permite publicaciones sin imagen o video.
    if (profile.platform === INSTAGRAM_PLATFORM && cleanMediaUrls.length === 0) {
      return NextResponse.json(
        {
          error:
            "Instagram requiere al menos una imagen o video: agregá la URL pública del medio.",
        },
        { status: 400 }
      );
    }

    const post = await prisma.post.create({
      data: {
        userId,
        socialProfileId,
        content: content.trim(),
        mediaUrls: cleanMediaUrls,
        scheduledFor: new Date(scheduledFor),
        status: "SCHEDULED",
      },
    });

    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (error) {
    console.error("Error al crear el post:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
