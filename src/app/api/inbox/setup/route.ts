import { NextResponse } from "next/server";
import { requireTenant, serverError } from "@/lib/api";
import { graphRequest } from "@/lib/facebook";
import {
  FACEBOOK_PLATFORM,
  INSTAGRAM_WEBHOOK_FIELDS,
  PAGE_WEBHOOK_FIELDS,
} from "@/lib/inbox";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SubscribedApps = {
  data?: { subscribed_fields?: string[] }[];
};

/**
 * Datos para configurar el webhook en el panel de Meta y para diagnosticar por
 * qué no llegan eventos: callback URL, token de verificación y campos que la
 * app tiene suscriptos en cada Página.
 */
export async function GET(req: Request) {
  const auth = await requireTenant();
  if ("response" in auth) return auth.response;
  const { tenantId } = auth;

  try {
    const [profiles, tenant] = await Promise.all([
      prisma.socialProfile.findMany({
        where: { tenantId },
        select: {
          id: true,
          platform: true,
          profileId: true,
          username: true,
          parentProfileId: true,
          accessToken: true,
        },
        orderBy: { platform: "asc" },
      }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { fbAppId: true } }),
    ]);

    const baseUrl = (process.env.NEXTAUTH_URL || new URL(req.url).origin).replace(/\/$/, "");

    const accounts = await Promise.all(
      profiles.map(async (profile) => {
        // Facebook se suscribe sobre la Página; Instagram, sobre la cuenta, porque
        // `comments` y `mentions` no existen como campos del objeto Página.
        const isInstagram = profile.platform !== FACEBOOK_PLATFORM;
        const objectId = isInstagram
          ? profile.profileId
          : profile.parentProfileId || profile.profileId;
        const webhookFields = isInstagram ? INSTAGRAM_WEBHOOK_FIELDS : PAGE_WEBHOOK_FIELDS;
        const canProbe = isInstagram || Boolean(profile.profileId);

        let subscribedFields: string[] | null = null;
        let error: string | null = null;

        if (canProbe) {
          try {
            const data = await graphRequest<SubscribedApps>(
              `/${objectId}/subscribed_apps?access_token=${encodeURIComponent(profile.accessToken)}`
            );
            subscribedFields = data.data?.[0]?.subscribed_fields ?? [];
          } catch (cause) {
            error = cause instanceof Error ? cause.message : "No se pudo consultar la suscripción";
          }
        }

        return {
          id: profile.id,
          platform: profile.platform,
          account: profile.username ?? profile.profileId,
          profileId: profile.profileId,
          webhookObjectId: objectId,
          subscribedFields,
          missingFields:
            subscribedFields === null
              ? null
              : webhookFields.filter((field) => !subscribedFields?.includes(field)),
          error,
        };
      })
    );

    return NextResponse.json({
      callbackUrl: `${baseUrl}/api/webhooks/meta`,
      verifyTokenConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
      appId: tenant?.fbAppId ?? null,
      webhookFields: { pages: PAGE_WEBHOOK_FIELDS, instagram: INSTAGRAM_WEBHOOK_FIELDS },
      accounts,
    });
  } catch (error) {
    console.error("Error al cargar la configuración del webhook:", error);
    return serverError("No se pudo cargar la configuración del webhook");
  }
}
