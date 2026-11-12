import { NextResponse } from "next/server";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validatePostPayload } from "@/lib/post-validation";

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
    const { content, scheduledFor, socialProfileId, mediaUrls, postType } = body || {};

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

    const validated = validatePostPayload({
      content,
      mediaUrls,
      postType,
      platform: profile.platform,
      req,
    });

    if ("error" in validated) return badRequest(validated.error);

    const post = await prisma.post.create({
      data: {
        tenantId: auth.tenantId,
        userId: auth.user.id,
        socialProfileId,
        content: validated.value.content,
        mediaUrls: validated.value.mediaUrls,
        postType: validated.value.postType,
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
