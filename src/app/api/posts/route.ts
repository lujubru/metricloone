import { NextResponse } from "next/server";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { INSTAGRAM_PLATFORM } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const posts = await prisma.post.findMany({
      where: { tenantId: auth.tenantId },
      include: { socialProfile: true },
      orderBy: { scheduledFor: "asc" },
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Error al obtener los posts:", error);
    return serverError();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const body = await req.json();
    const { content, scheduledFor, socialProfileId, mediaUrls } = body || {};

    if (!content || typeof content !== "string" || !content.trim()) {
      return badRequest("El contenido es obligatorio");
    }

    if (!socialProfileId) {
      return badRequest("Debes seleccionar un perfil");
    }

    if (!scheduledFor || isNaN(new Date(scheduledFor).getTime())) {
      return badRequest("La fecha de programación es inválida");
    }

    // El perfil tiene que pertenecer a la cuenta del usuario.
    const profile = await prisma.socialProfile.findFirst({
      where: { id: socialProfileId, tenantId: auth.tenantId },
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
      return badRequest(
        "Instagram requiere al menos una imagen o video: agregá la URL pública del medio."
      );
    }

    const post = await prisma.post.create({
      data: {
        tenantId: auth.tenantId,
        userId: auth.user.id,
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
    return serverError();
  }
}
