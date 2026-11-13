import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fitImageForInstagramFeed } from "@/lib/image-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MediaRouteContext = { params: Promise<{ id: string; filename: string }> };

/**
 * Sirve un medio guardado en la base. Es público a propósito: Meta descarga los
 * archivos desde su servidor para publicarlos en Instagram/Facebook.
 *
 * Con `?ig=feed` se recorta la imagen al rango de aspecto que exige Instagram
 * (4:5 a 1.91:1). El publisher usa esa variante al publicar, así los archivos
 * subidos antes de esta regla también se publican sin error.
 */
export async function GET(req: Request, context: MediaRouteContext) {
  const { id } = await context.params;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { data: true, mimeType: true, filename: true },
  });

  if (!asset) {
    return NextResponse.json({ error: "El archivo no existe" }, { status: 404 });
  }

  let body: Buffer = asset.data;
  let mimeType = asset.mimeType;
  let cacheControl = "public, max-age=31536000, immutable";
  const wantsInstagramFeed = new URL(req.url).searchParams.get("ig") === "feed";

  if (wantsInstagramFeed && asset.mimeType.startsWith("image/")) {
    try {
      body = await fitImageForInstagramFeed(asset.data);
      mimeType = "image/jpeg";
      // Variante derivada: se cachea menos para que un cambio de recorte se propague.
      cacheControl = "public, max-age=604800";
    } catch (error) {
      // Ante un archivo ilegible se sirve el original: Meta devuelve su propio error.
      console.error(`[media] No pudimos recortar ${id} para Instagram:`, error);
    }
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(body.length),
      "Cache-Control": cacheControl,
      "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"`,
    },
  });
}

export const HEAD = GET;
