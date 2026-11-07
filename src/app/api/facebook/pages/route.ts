import { NextResponse } from "next/server";
import { requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { grantedPermissions, listManagedPages } from "@/lib/facebook";

export const dynamic = "force-dynamic";

const REQUIRED_PERMISSIONS = [
  "pages_show_list",
  "pages_manage_posts",
  "business_management",
] as const;

export async function GET() {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    // Token de usuario de la cuenta: se guarda al conectar Facebook.
    const connection = await prisma.fbConnection.findUnique({
      where: { tenantId: auth.tenantId },
    });

    if (!connection?.userAccessToken) {
      return NextResponse.json({ error: "Cuenta de Facebook no conectada" }, { status: 404 });
    }

    // /me/accounts + Páginas de portafolios comerciales, siguiendo la paginación
    const { pages, warnings } = await listManagedPages(connection.userAccessToken);

    // El token puede ser más viejo que los permisos solicitados: avisamos qué
    // falta para que el usuario vuelva a autorizar la app.
    try {
      const granted = await grantedPermissions(connection.userAccessToken);
      const missing = REQUIRED_PERMISSIONS.filter((permission) => !granted.includes(permission));
      if (missing.length > 0) {
        warnings.push(
          `La sesión de Facebook no tiene estos permisos: ${missing.join(
            ", "
          )}. Volvé a conectar Facebook para concederlos y tildá todas las Páginas en la pantalla de autorización.`
        );
      }
    } catch {
      // Si no se pueden leer los permisos, igual devolvemos las Páginas encontradas.
    }

    return NextResponse.json({ pages, warnings });
  } catch (error) {
    console.error("Error al obtener las páginas de FB:", error);
    return serverError();
  }
}
