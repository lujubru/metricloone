import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { grantedPermissions, listManagedPages } from "@/lib/facebook";

const REQUIRED_PERMISSIONS = [
  "pages_show_list",
  "pages_manage_posts",
  "business_management",
] as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Buscar la conexión de Facebook del usuario en la base de datos
    const facebookAccount = await prisma.account.findFirst({
      where: {
        userId: userId,
        provider: "facebook",
      },
    });

    if (!facebookAccount || !facebookAccount.access_token) {
      return NextResponse.json({ error: "Cuenta de Facebook no conectada" }, { status: 404 });
    }

    // /me/accounts + Páginas de portafolios comerciales, siguiendo la paginación
    const { pages, warnings } = await listManagedPages(facebookAccount.access_token);

    // El token puede ser más viejo que los permisos declarados en auth.ts:
    // avisamos qué falta para que el usuario vuelva a autorizar la app.
    try {
      const granted = await grantedPermissions(facebookAccount.access_token);
      const missing = REQUIRED_PERMISSIONS.filter((permission) => !granted.includes(permission));
      if (missing.length > 0) {
        warnings.push(
          `Tu sesión de Facebook no tiene estos permisos: ${missing.join(", ")}. Cerrá sesión y volvé a entrar con Facebook para concederlos, y tildá todas las Páginas en la pantalla de autorización.`
        );
      }
    } catch {
      // Si no se pueden leer los permisos, igual devolvemos las Páginas encontradas.
    }

    // Devuelve la lista de páginas de Facebook (con sus id, name y access_token específicos de página)
    return NextResponse.json({ pages, warnings });
  } catch (error) {
    console.error("Error al obtener las páginas de FB:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
