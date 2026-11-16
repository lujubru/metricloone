import { NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { listManagedPages } from "@/lib/facebook";
import { listInstagramAccounts } from "@/lib/instagram";
import { grantProfileAccess, importNetworks } from "@/lib/networks";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Redes que el administrador puede importar: se leen con el token de su propia
 * sesión de Facebook (la del tenant de la plataforma), no con el del cliente.
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const connection = await prisma.fbConnection.findUnique({ where: { tenantId: auth.tenantId } });
    if (!connection) {
      return NextResponse.json({
        connected: false,
        facebook: null,
        pages: [],
        instagram: [],
        warnings: [],
      });
    }

    const facebook = {
      fbUserName: connection.fbUserName,
      tokenExpiresAt: connection.tokenExpiresAt,
    };

    try {
      const [{ pages, warnings }, accounts] = await Promise.all([
        listManagedPages(connection.userAccessToken),
        listInstagramAccounts(connection.userAccessToken),
      ]);

      return NextResponse.json({
        connected: true,
        facebook,
        pages: pages.map((page) => ({
          id: page.id,
          name: page.name,
          category: page.category ?? null,
        })),
        instagram: accounts.map((account) => ({
          id: account.id,
          username: account.username,
          pageId: account.pageId,
          pageName: account.pageName,
          followersCount: account.followersCount,
          profilePictureUrl: account.profilePictureUrl,
        })),
        warnings,
      });
    } catch (error) {
      // Token vencido o permisos retirados: se informa sin romper el panel.
      return NextResponse.json({
        connected: true,
        facebook,
        pages: [],
        instagram: [],
        warnings: [`No pudimos leer tus redes de Meta: ${errorMessage(error)}`],
      });
    }
  } catch (error) {
    console.error("Error al descubrir las redes del administrador:", error);
    return serverError();
  }
}

/**
 * Importa redes ya vinculadas a la cuenta destino y las asigna a los usuarios
 * indicados. Sin `userIds`, la asignación es para todos los usuarios de la cuenta.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const body = await req.json().catch(() => null);
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
    const pageIds = stringList(body?.pageIds);
    const instagramIds = stringList(body?.instagramIds);
    const explicitUsers = Array.isArray(body?.userIds);

    if (!tenantId) return badRequest("Elegí la cuenta que va a administrar las redes");
    if (!pageIds.length && !instagramIds.length) return badRequest("Elegí al menos una red social");

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return badRequest("La cuenta seleccionada no existe");

    const connection = await prisma.fbConnection.findUnique({ where: { tenantId: auth.tenantId } });
    if (!connection) {
      return badRequest(
        "Conectá tu cuenta de Facebook desde Administración para poder importar redes",
      );
    }

    const result = await importNetworks({
      tenantId,
      userId: auth.user.id,
      userAccessToken: connection.userAccessToken,
      pageIds,
      instagramIds,
    });

    const candidates = explicitUsers
      ? stringList(body?.userIds)
      : (await prisma.user.findMany({ where: { tenantId }, select: { id: true } })).map(
          (user) => user.id,
        );

    // Un usuario de otra cuenta nunca puede recibir accesos por este endpoint.
    const allowedUsers = candidates.length
      ? await prisma.user.findMany({
          where: { id: { in: candidates }, tenantId },
          select: { id: true },
        })
      : [];

    const grants = await grantProfileAccess(
      result.profiles.map((profile) => profile.id),
      allowedUsers.map((user) => user.id),
    );

    return NextResponse.json({
      success: true,
      imported: result.profiles,
      skipped: result.skipped,
      warnings: result.warnings,
      grantedTo: allowedUsers.length,
      grants,
    });
  } catch (error) {
    console.error("Error al importar las redes:", error);
    return serverError("No se pudieron importar las redes sociales");
  }
}
