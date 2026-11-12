import { NextResponse } from "next/server";
import { badRequest, requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { listManagedPages } from "@/lib/facebook";
import { subscribePageWebhooks } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const body = await req.json();
    const { selectedPages } = body;

    if (!selectedPages || !Array.isArray(selectedPages)) {
      return badRequest("Formato de datos inválido");
    }

    const connection = await prisma.fbConnection.findUnique({
      where: { tenantId: auth.tenantId },
    });
    if (!connection?.userAccessToken) {
      return NextResponse.json({ error: "Cuenta de Facebook no conectada" }, { status: 404 });
    }

    // Los tokens de Página se toman de Facebook, no del body: así el cliente
    // no puede guardar una Página (ni un token) que no le pertenece.
    const { pages: availablePages } = await listManagedPages(connection.userAccessToken);
    const available = new Map(availablePages.map((page) => [page.id, page]));

    const selectedIds = selectedPages
      .map((page: { id?: unknown }) => (typeof page?.id === "string" ? page.id : null))
      .filter((id: string | null): id is string => Boolean(id));

    if (selectedIds.length === 0) return badRequest("No seleccionaste ninguna Página");

    const savedProfiles = [];

    // Los webhooks se piden acá y no en un paso aparte: si la Página recién se
    // conecta y no queda suscripta, el Inbox nunca recibe eventos. Un fallo de
    // suscripción no debe romper el guardado de la Página.
    const webhookIssues: string[] = [];

    for (const pageId of selectedIds) {
      const page = available.get(pageId);
      if (!page) continue;

      const profile = await prisma.socialProfile.upsert({
        where: {
          tenantId_platform_profileId: {
            tenantId: auth.tenantId,
            platform: "facebook_page",
            profileId: page.id,
          },
        },
        update: {
          username: page.name,
          accessToken: page.access_token,
          parentProfileId: null,
          updatedAt: new Date(),
        },
        create: {
          tenantId: auth.tenantId,
          userId: auth.user.id,
          platform: "facebook_page",
          profileId: page.id,
          username: page.name,
          accessToken: page.access_token,
        },
      });
      savedProfiles.push(profile);

      try {
        const result = await subscribePageWebhooks(page.id, page.access_token);
        if (result.rejected.length) {
          webhookIssues.push(
            `${page.name}: Meta rechazó los campos ${result.rejected.join(", ")}`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "error desconocido";
        webhookIssues.push(`${page.name}: ${message}`);
      }
    }

    return NextResponse.json({
      success: true,
      savedCount: savedProfiles.length,
      skipped: selectedIds.length - savedProfiles.length,
      webhookWarnings: webhookIssues,
    });
  } catch (error) {
    console.error("Error al guardar las páginas:", error);
    return serverError();
  }
}
