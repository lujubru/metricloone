import { NextResponse } from "next/server";
import sharp from "sharp";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { MAX_IMAGE_DIMENSION } from "@/lib/image-processing";
import { prisma } from "@/lib/prisma";
import {
  MAX_MEDIA_ITEMS,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_FILE_MB,
  mediaAssetUrl,
  mediaKindFromFilename,
  mediaKindFromMime,
  publicBaseUrl,
  sanitizeFilename,
  type MediaKind,
  type UploadedMedia,
} from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatMb(bytes: number) {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return badRequest("No pudimos leer los archivos enviados");
    }

    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) return badRequest("No se recibió ningún archivo");
    if (files.length > MAX_MEDIA_ITEMS) {
      return badRequest(`Podés subir hasta ${MAX_MEDIA_ITEMS} archivos por publicación`);
    }

    const baseUrl = publicBaseUrl(req);
    const uploaded: UploadedMedia[] = [];

    for (const file of files) {
      const kind: MediaKind | null = mediaKindFromMime(file.type) ?? mediaKindFromFilename(file.name);
      if (!kind) {
        return badRequest(`Formato no soportado: ${file.name}. Usá JPG, PNG, WEBP o MP4/MOV.`);
      }
      if (file.size > MEDIA_MAX_FILE_BYTES) {
        return badRequest(
          `${file.name} pesa ${formatMb(file.size)} y el máximo por archivo es ${MEDIA_MAX_FILE_MB} MB`
        );
      }
      if (file.size === 0) return badRequest(`${file.name} está vacío`);

      const original = Buffer.from(await file.arrayBuffer());
      let data = original;
      let mimeType = file.type || (kind === "IMAGE" ? "image/jpeg" : "video/mp4");
      let filename: string;

      if (kind === "IMAGE") {
        try {
          // Instagram sólo acepta JPEG: normalizamos y quitamos transparencias.
          data = await sharp(original)
            .rotate()
            .resize({
              width: MAX_IMAGE_DIMENSION,
              height: MAX_IMAGE_DIMENSION,
              fit: "inside",
              withoutEnlargement: true,
            })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer();
        } catch {
          return badRequest(`No pudimos procesar la imagen ${file.name}. Probá con otro archivo.`);
        }
        mimeType = "image/jpeg";
        filename = `${sanitizeFilename(file.name)}.jpg`;
      } else {
        const extension = /\.(mp4|mov|m4v)$/i.test(file.name)
          ? file.name.split(".").pop()!.toLowerCase()
          : "mp4";
        filename = `${sanitizeFilename(file.name)}.${extension}`;
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          tenantId: auth.tenantId,
          filename,
          mimeType,
          kind,
          size: data.length,
          data,
        },
      });

      uploaded.push({
        id: asset.id,
        url: mediaAssetUrl({ id: asset.id, filename: asset.filename, baseUrl }),
        filename: asset.filename,
        mimeType: asset.mimeType,
        kind,
        size: asset.size,
      });
    }

    return NextResponse.json({ media: uploaded }, { status: 201 });
  } catch (error) {
    console.error("Error al subir medios:", error);
    return serverError("No pudimos guardar los archivos");
  }
}

/** Borra medios que el usuario quitó del formulario antes de guardar el post. */
export async function DELETE(req: Request) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const { ids } = (await req.json().catch(() => ({ ids: [] }))) as { ids?: unknown };
    const list = Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (list.length === 0) return badRequest("No se indicaron medios para borrar");

    await prisma.mediaAsset.deleteMany({
      where: { id: { in: list }, tenantId: auth.tenantId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al borrar medios:", error);
    return serverError("No pudimos borrar los archivos");
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Usá POST para subir archivos a este endpoint" },
    { status: 405 }
  );
}
