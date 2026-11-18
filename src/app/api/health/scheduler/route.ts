import { NextResponse } from "next/server";
import { ADMIN_ROLE, getSessionUser } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cron-auth";
import { readSchedulerStatus } from "@/lib/scheduler-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salud del scheduler interno. Responde 503 cuando pasó más de dos intervalos
 * sin que termine un tick: el proceso vive pero dejó de publicar, que es el
 * síntoma de los posts que "nunca se publican solos".
 *
 * Acceso: secreto de cron (para monitoreo externo) o sesión de administrador.
 */
export async function GET(req: Request) {
  let authorized = isCronAuthorized(req);

  if (!authorized) {
    const user = await getSessionUser();
    authorized = user?.role === ADMIN_ROLE;
  }

  if (!authorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const status = readSchedulerStatus();
  return NextResponse.json(status, { status: status.stalled ? 503 : 200 });
}
