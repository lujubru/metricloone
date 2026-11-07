import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { exchangeCodeForToken, exchangeForLongLivedToken, getFacebookUser } from "@/lib/facebook";
import { FB_STATE_COOKIE, facebookCallbackUrl } from "@/lib/facebook-oauth";

export const dynamic = "force-dynamic";

function fail(request: Request, reason: string) {
  const url = new URL("/connections", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

/** Callback del OAuth: guarda el token de usuario del tenant que lo inició. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) return fail(request, "oauth_cancelado");

  let payload: { tenantId?: string; nonce?: string };
  try {
    payload = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return fail(request, "state_invalido");
  }

  const store = await cookies();
  const expectedNonce = store.get(FB_STATE_COOKIE)?.value;
  store.delete(FB_STATE_COOKIE);

  if (!payload.tenantId || !payload.nonce || payload.nonce !== expectedNonce) {
    return fail(request, "state_invalido");
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: payload.tenantId } });
  if (!tenant?.fbAppId || !tenant.fbAppSecret) return fail(request, "credenciales");

  const appSecret = decryptSecret(tenant.fbAppSecret);

  try {
    const shortLived = await exchangeCodeForToken({
      appId: tenant.fbAppId,
      appSecret,
      redirectUri: facebookCallbackUrl(request),
      code,
    });

    let accessToken = shortLived.access_token;
    let expiresAt: Date | null = null;

    try {
      const longLived = await exchangeForLongLivedToken({
        appId: tenant.fbAppId,
        appSecret,
        accessToken,
      });
      accessToken = longLived.access_token;
      if (longLived.expires_in) {
        expiresAt = new Date(Date.now() + longLived.expires_in * 1000);
      }
    } catch {
      // Si el exchange falla se conserva el token corto (~1 hora).
    }

    const me = await getFacebookUser(accessToken);

    await prisma.fbConnection.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        fbUserId: me.id,
        fbUserName: me.name ?? null,
        userAccessToken: accessToken,
        tokenExpiresAt: expiresAt,
      },
      update: {
        fbUserId: me.id,
        fbUserName: me.name ?? null,
        userAccessToken: accessToken,
        tokenExpiresAt: expiresAt,
      },
    });

    const ok = new URL("/connections", request.url);
    ok.searchParams.set("connected", "facebook");
    return NextResponse.redirect(ok);
  } catch (error) {
    console.error("Error conectando Facebook:", error);
    return fail(request, "exchange");
  }
}
