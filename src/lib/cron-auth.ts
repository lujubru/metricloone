export function cronSecretConfigured() {
  return Boolean(process.env.CRON_SECRET);
}

/**
 * Valida el secreto de cron por cualquiera de los tres formatos aceptados:
 * `Authorization: Bearer <secret>`, `x-cron-secret: <secret>` o `?secret=`.
 * Coolify no permite headers personalizados en todos los planes, de ahí el query.
 */
export function isCronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const custom = req.headers.get("x-cron-secret") || "";
  const query = new URL(req.url).searchParams.get("secret") || "";

  return bearer === secret || custom === secret || query === secret;
}
