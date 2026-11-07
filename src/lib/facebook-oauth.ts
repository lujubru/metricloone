/**
 * URL de callback registrada en la app de Facebook del cliente. Debe ser
 * idéntica en el panel de Meta, así que se arma siempre desde el mismo lugar.
 */
export function facebookCallbackUrl(request: Request): string {
  const base = (process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
  return `${base}/api/connect/facebook/callback`;
}

export const FB_STATE_COOKIE = "fb_oauth_state";
