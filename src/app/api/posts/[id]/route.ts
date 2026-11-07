import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    const { scheduledFor, content, mediaUrls } = body || {};

    const post = await prisma.post.findFirst({ where: { id, userId } });

    if (!post) {
      return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
    }

    if (post.status === "PUBLISHING") {
      return NextResponse.json(
        { error: "El post se está publicando, espera unos segundos" },
        { status: 409 }
      );
    }

    if (post.status === "PUBLISHED") {
      return NextResponse.json(
        { error: "El post ya fue publicado en Facebook" },
        { status: 409 }
      );
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
      if (isNaN(date.getTime())) {
        return NextResponse.json({ error: "La fecha de programación es inválida" }, { status: 400 });
      }
      data.scheduledFor = date;
    }

    if (content !== undefined) {
      if (typeof content !== "string" || !content.trim()) {
        return NextResponse.json({ error: "El contenido es obligatorio" }, { status: 400 });
      }
      data.content = content.trim();
    }

    if (Array.isArray(mediaUrls)) {
      data.mediaUrls = mediaUrls.filter((media): media is string => typeof media === "string");
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
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const { id } = await context.params;

    const post = await prisma.post.findFirst({
      where: { id, userId },
    });

    if (!post) {
      return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
    }

    await prisma.post.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar el post:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
