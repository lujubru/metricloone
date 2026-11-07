import { NextResponse } from "next/server";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { INSTAGRAM_PLATFORM } from "@/lib/instagram";

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    const { scheduledFor, content, mediaUrls } = body || {};

    const post = await prisma.post.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!post) return notFound();

    if (post.status === "PUBLISHING") {
      return NextResponse.json(
        { error: "El post se está publicando, espera unos segundos" },
        { status: 409 }
      );
    }

    if (post.status === "PUBLISHED") {
      return NextResponse.json({ error: "El post ya fue publicado" }, { status: 409 });
    }

    const data: {
      status: string;
      errorMessage: null;
      scheduledFor?: Date;
      content?: string;
      mediaUrls?: string[];
    } = { status: "SCHEDULED", errorMessage: null };

    if (scheduledFor !== undefined) {
      const date = new Date(scheduledFor);
      if (isNaN(date.getTime())) return badRequest("La fecha de programación es inválida");
      data.scheduledFor = date;
    }

    if (content !== undefined) {
      if (typeof content !== "string" || !content.trim()) return badRequest("El contenido es obligatorio");
      data.content = content.trim();
    }

    if (Array.isArray(mediaUrls)) {
      data.mediaUrls = mediaUrls.filter(
        (media): media is string => typeof media === "string" && /^https?:\/\//i.test(media)
      );
    }

    const profile = await prisma.socialProfile.findUnique({
      where: { id: post.socialProfileId },
    });

    const finalMedia = data.mediaUrls ?? post.mediaUrls;

    if (profile?.platform === INSTAGRAM_PLATFORM && finalMedia.length === 0) {
      return badRequest(
        "Instagram requiere al menos una imagen o video: agregá la URL pública del medio."
      );
    }

    // Reprogramar un post fallido reinicia el contador de intentos.
    const updated = await prisma.post.update({
      where: { id },
      data: {
        ...data,
        ...(post.status === "FAILED" ? { attempts: 0 } : {}),
      },
    });

    return NextResponse.json({ success: true, post: updated });
  } catch (error) {
    console.error("Error al actualizar el post:", error);
    return serverError();
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const { id } = await context.params;

    const post = await prisma.post.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!post) return notFound();

    await prisma.post.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar el post:", error);
    return serverError();
  }
}
