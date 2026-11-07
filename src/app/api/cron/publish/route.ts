import { NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const custom = req.headers.get("x-cron-secret") || "";
  const query = new URL(req.url).searchParams.get("secret") || "";

  return bearer === secret || custom === secret || query === secret;
}

async function handle(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado en el servidor" },
      { status: 503 }
    );
  }

  if (!isAuthorized(req)) {
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
