import { decryptSecret } from "./crypto";

export const FB_STATE_COOKIE = "fb_oauth_state";

/**
 * URL de callback registrada en la app de Facebook. Debe ser idéntica en el
 * panel de Meta, así que se arma siempre desde el mismo lugar.
 */
export function facebookCallbackUrl(request: Request): string {
  const base = (process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
  return `${base}/api/connect/facebook/callback`;
}

export type AppCredentials = {
  appId: string;
  appSecret: string;
  /** `platform` = la app de Meta del dueño del sistema; `tenant` = credenciales cargadas por el cliente. */
  source: "platform" | "tenant";
};

/** Pantallas a las que puede volver el OAuth. Evita que `next` sea un redirect abierto. */
export const OAUTH_RETURN_PATHS: readonly string[] = ["/connections", "/admin"];

export function normalizeReturnPath(value: string | null | undefined): string {
  return value && OAUTH_RETURN_PATHS.includes(value) ? value : "/connections";
}

function clean(value: string | undefined | null): string {
  return (value ?? "").trim();
}

/**
 * Credenciales de la app de Meta del dueño de la plataforma. Se leen de las
 * variables de entorno para que todos los tenants compartan la misma app.
 */
export function platformAppCredentials(): { appId: string; appSecret: string } | null {
  const appId = clean(process.env.FB_APP_ID) || clean(process.env.FACEBOOK_CLIENT_ID);
  const appSecret = clean(process.env.FB_APP_SECRET) || clean(process.env.FACEBOOK_CLIENT_SECRET);
  return appId && appSecret ? { appId, appSecret } : null;
}

export function hasPlatformAppCredentials(): boolean {
  return platformAppCredentials() !== null;
}

/**
 * Credenciales a usar con un tenant: primero las de la plataforma (variables de
 * entorno) y, si no hay, las que el cliente haya cargado en su cuenta.
 * `tenant` puede venir nulo cuando todavía no hay conexión creada.
 */
export function resolveAppCredentials(
  tenant: { fbAppId: string | null; fbAppSecret: string | null } | null | undefined,
): AppCredentials | null {
  const platform = platformAppCredentials();
  if (platform) return { ...platform, source: "platform" };

  if (tenant?.fbAppId && tenant.fbAppSecret) {
    return {
      appId: tenant.fbAppId,
      appSecret: decryptSecret(tenant.fbAppSecret),
      source: "tenant",
    };
  }

  return null;
}
