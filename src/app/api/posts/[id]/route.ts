import { NextResponse } from "next/server";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validatePostPayload } from "@/lib/post-validation";

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
    const { scheduledFor, content, mediaUrls, postType } = body || {};

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
      postType?: string;
    } = { status: "SCHEDULED", errorMessage: null };

    if (scheduledFor !== undefined) {
      const date = new Date(scheduledFor);
      if (isNaN(date.getTime())) return badRequest("La fecha de programación es inválida");
      data.scheduledFor = date;
    }

    const profile = await prisma.socialProfile.findUnique({
      where: { id: post.socialProfileId },
    });

    const validated = validatePostPayload({
      content: content !== undefined ? content : post.content,
      mediaUrls: mediaUrls !== undefined ? mediaUrls : post.mediaUrls,
      postType: postType !== undefined ? postType : post.postType,
      platform: profile?.platform ?? null,
      req,
    });

    if ("error" in validated) return badRequest(validated.error);

    data.content = validated.value.content;
    data.mediaUrls = validated.value.mediaUrls;
    data.postType = validated.value.postType;

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

    // Los medios subidos para este post ya no se usan: liberamos el espacio.
    const assetIds = post.mediaUrls
      .map((url) => url.match(/\/api\/media\/([^/]+)\//)?.[1])
      .filter((value): value is string => Boolean(value));

    if (assetIds.length > 0) {
      await prisma.mediaAsset.deleteMany({
        where: { id: { in: assetIds }, tenantId: auth.tenantId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar el post:", error);
    return serverError();
  }
}
