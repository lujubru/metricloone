import { NextResponse } from "next/server";
import { cronSecretConfigured, isCronAuthorized } from "@/lib/cron-auth";
import { publishDuePosts } from "@/lib/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronSecretConfigured()) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado en el servidor" },
      { status: 503 }
    );
  }

  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await publishDuePosts();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error al publicar posts programados:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// Coolify (y la mayoría de schedulers) permiten elegir el método; aceptamos ambos.
export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
