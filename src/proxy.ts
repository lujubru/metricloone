import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login", "/privacy", "/data-deletion", "/terms"];

/**
 * Pantallas reservadas al ADMIN: desde ahí se vinculan redes, se desconectan
 * perfiles y se toca la configuración de la cuenta. Un cliente que entre por
 * URL directa vuelve al panel.
 */
const ADMIN_ONLY_PATHS = ["/admin", "/smartlink", "/connections", "/settings"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Protege las páginas de la app: sin sesión se redirige a /login conservando
 * el destino en `callbackUrl`, y las pantallas de administración de redes
 * rebotan al panel si el usuario es CLIENT. Las rutas /api validan por su
 * cuenta con `requireTenant()` / `requireAdmin()`.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token?.id) {
    if (isAdminOnlyPath(pathname) && token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$).*)"],
};
