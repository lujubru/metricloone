import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireTenant } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/crypto";
import { buildOAuthDialogUrl } from "@/lib/facebook";
import { FB_STATE_COOKIE, facebookCallbackUrl } from "@/lib/facebook-oauth";

export const dynamic = "force-dynamic";

/** Inicia el OAuth de Facebook con la app propia del tenant logueado. */
export async function GET(request: Request) {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;

  const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId } });
  if (!tenant) {
    return NextResponse.redirect(new URL("/connections?error=tenant", request.url));
  }
  if (!tenant.fbAppId || !tenant.fbAppSecret) {
    return NextResponse.redirect(new URL("/connections?error=credentials", request.url));
  }

  const nonce = randomToken();
  const state = Buffer.from(
    JSON.stringify({ tenantId: tenant.id, nonce, ts: Date.now() })
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
      appId: tenant.fbAppId,
      redirectUri: facebookCallbackUrl(request),
      state,
    })
  );
}
