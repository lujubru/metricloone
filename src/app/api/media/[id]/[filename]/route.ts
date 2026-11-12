import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MediaRouteContext = { params: Promise<{ id: string; filename: string }> };

/**
 * Sirve un medio guardado en la base. Es público a propósito: Meta descarga los
 * archivos desde su servidor para publicarlos en Instagram/Facebook.
 */
export async function GET(_req: Request, context: MediaRouteContext) {
  const { id } = await context.params;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { data: true, mimeType: true, filename: true },
  });

  if (!asset) {
    return NextResponse.json({ error: "El archivo no existe" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"`,
    },
  });
}

export const HEAD = GET;
