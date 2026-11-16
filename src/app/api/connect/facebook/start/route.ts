import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireTenant } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/crypto";
import { buildOAuthDialogUrl } from "@/lib/facebook";
import {
  FB_STATE_COOKIE,
  facebookCallbackUrl,
  normalizeReturnPath,
  resolveAppCredentials,
} from "@/lib/facebook-oauth";

export const dynamic = "force-dynamic";

/**
 * Inicia el OAuth de Facebook. Usa la app de la plataforma (variables de
 * entorno) y, si no hay, las credenciales propias del tenant logueado.
 * `?next=/admin` vuelve al panel de administración en lugar de /connections.
 */
export async function GET(request: Request) {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;

  const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId } });
  if (!tenant) {
    return NextResponse.redirect(new URL("/connections?error=tenant", request.url));
  }

  const credentials = resolveAppCredentials(tenant);
  const returnPath = normalizeReturnPath(new URL(request.url).searchParams.get("next"));
  if (!credentials) {
    return NextResponse.redirect(new URL(`${returnPath}?error=credentials`, request.url));
  }

  const nonce = randomToken();
  const state = Buffer.from(
    JSON.stringify({ tenantId: tenant.id, nonce, ts: Date.now(), next: returnPath })
  ).toString("base64url");

  const store = await cookies();
  store.set(FB_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(
    buildOAuthDialogUrl({
      appId: credentials.appId,
      redirectUri: facebookCallbackUrl(request),
      state,
    })
  );
}
