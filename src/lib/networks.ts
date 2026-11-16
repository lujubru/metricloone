import { prisma } from "./prisma";
import { listManagedPages, type ManagedPage } from "./facebook";
import { INSTAGRAM_PLATFORM, listInstagramAccounts, type InstagramAccount } from "./instagram";
import { FACEBOOK_PLATFORM, subscribeInstagramWebhooks, subscribePageWebhooks } from "./inbox";

export type ImportedProfile = {
  id: string;
  platform: string;
  profileId: string;
  username: string | null;
};

export type ImportNetworksInput = {
  /** Cuenta (tenant) dueña de las redes importadas. */
  tenantId: string;
  /** Usuario que dispara la importación; queda como dueño del perfil. */
  userId: string;
  /** Token de usuario de Facebook del administrador. */
  userAccessToken: string;
  pageIds?: string[];
  instagramIds?: string[];
};

export type ImportNetworksResult = {
  profiles: ImportedProfile[];
  skipped: number;
  warnings: string[];
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function toImported(profile: {
  id: string;
  platform: string;
  profileId: string;
  username: string | null;
}): ImportedProfile {
  return {
    id: profile.id,
    platform: profile.platform,
    profileId: profile.profileId,
    username: profile.username,
  };
}

async function upsertPage(page: ManagedPage, tenantId: string, userId: string) {
  return prisma.socialProfile.upsert({
    where: {
      tenantId_platform_profileId: { tenantId, platform: FACEBOOK_PLATFORM, profileId: page.id },
    },
    update: { username: page.name, accessToken: page.access_token, userId },
    create: {
      tenantId,
      userId,
      platform: FACEBOOK_PLATFORM,
      profileId: page.id,
      username: page.name,
      accessToken: page.access_token,
    },
  });
}

async function upsertInstagram(account: InstagramAccount, tenantId: string, userId: string) {
  return prisma.socialProfile.upsert({
    where: {
      tenantId_platform_profileId: {
        tenantId,
        platform: INSTAGRAM_PLATFORM,
        profileId: account.id,
      },
    },
    update: {
      username: account.username,
      accessToken: account.pageAccessToken,
      parentProfileId: account.pageId,
      userId,
    },
    create: {
      tenantId,
      userId,
      platform: INSTAGRAM_PLATFORM,
      profileId: account.id,
      username: account.username,
      accessToken: account.pageAccessToken,
      parentProfileId: account.pageId,
    },
  });
}

/**
 * Importa a la cuenta indicada las redes que el administrador eligió de su
 * propia sesión de Facebook, y suscribe los webhooks de cada una. Los datos
 * (nombre, token de Página) se resuelven acá contra la API de Meta, nunca se
 * confía en lo que manda el cliente.
 */
export async function importNetworks({
  tenantId,
  userId,
  userAccessToken,
  pageIds = [],
  instagramIds = [],
}: ImportNetworksInput): Promise<ImportNetworksResult> {
  const wantedPages = new Set(pageIds.filter(Boolean));
  const wantedInstagram = new Set(instagramIds.filter(Boolean));
  const warnings: string[] = [];
  const profiles: ImportedProfile[] = [];

  if (!wantedPages.size && !wantedInstagram.size) {
    return { profiles, skipped: 0, warnings: ["No seleccionaste ninguna red social."] };
  }

  if (wantedPages.size) {
    const { pages, warnings: pageWarnings } = await listManagedPages(userAccessToken);
    warnings.push(...pageWarnings);
    const available = new Map(pages.map((page) => [page.id, page]));

    for (const pageId of wantedPages) {
      const page = available.get(pageId);
      if (!page) {
        warnings.push(`La Página ${pageId} no está disponible con la cuenta de Facebook conectada.`);
        continue;
      }

      const profile = await upsertPage(page, tenantId, userId);
      profiles.push(toImported(profile));

      try {
        const result = await subscribePageWebhooks(page.id, page.access_token);
        if (result.rejected.length) {
          warnings.push(`${page.name}: Meta rechazó los webhooks ${result.rejected.join(", ")}.`);
        }
      } catch (error) {
        warnings.push(`${page.name}: no pudimos suscribir los webhooks (${messageOf(error)}).`);
      }
    }
  }

  if (wantedInstagram.size) {
    let accounts: InstagramAccount[] = [];
    try {
      accounts = await listInstagramAccounts(userAccessToken);
    } catch (error) {
      warnings.push(`No pudimos leer las cuentas de Instagram (${messageOf(error)}).`);
    }
    const available = new Map(accounts.map((account) => [account.id, account]));

    for (const igId of wantedInstagram) {
      const account = available.get(igId);
      if (!account) {
        warnings.push(
          `La cuenta de Instagram ${igId} no está disponible con la cuenta de Facebook conectada.`,
        );
        continue;
      }

      const profile = await upsertInstagram(account, tenantId, userId);
      profiles.push(toImported(profile));

      try {
        const result = await subscribeInstagramWebhooks(account.id, account.pageAccessToken);
        if (result.rejected.length) {
          warnings.push(
            `@${account.username}: Meta rechazó los webhooks ${result.rejected.join(", ")}.`,
          );
        }
      } catch (error) {
        warnings.push(`@${account.username}: no pudimos suscribir los webhooks (${messageOf(error)}).`);
      }
    }
  }

  return {
    profiles,
    skipped: wantedPages.size + wantedInstagram.size - profiles.length,
    warnings,
  };
}

/** Da acceso a un conjunto de perfiles a uno o varios usuarios (idempotente). */
export async function grantProfileAccess(
  socialProfileIds: string[],
  userIds: string[],
): Promise<number> {
  const profileIds = [...new Set(socialProfileIds.filter(Boolean))];
  const uniqueUsers = [...new Set(userIds.filter(Boolean))];
  if (!profileIds.length || !uniqueUsers.length) return 0;

  const created = await prisma.socialProfileAccess.createMany({
    data: uniqueUsers.flatMap((userId) =>
      profileIds.map((socialProfileId) => ({ userId, socialProfileId })),
    ),
    skipDuplicates: true,
  });
  return created.count;
}

/**
 * Reemplaza las redes asignadas a un usuario. Sólo se aceptan perfiles de su
 * misma cuenta, así que un id inventado no da acceso a nada.
 */
export async function syncProfileAccess({
  userId,
  tenantId,
  socialProfileIds,
}: {
  userId: string;
  tenantId: string;
  socialProfileIds: string[];
}): Promise<number> {
  const wanted = [...new Set(socialProfileIds.filter(Boolean))];
  const valid = wanted.length
    ? await prisma.socialProfile.findMany({
        where: { id: { in: wanted }, tenantId },
        select: { id: true },
      })
    : [];
  const validIds = valid.map((profile) => profile.id);

  await prisma.$transaction([
    prisma.socialProfileAccess.deleteMany({
      where: {
        userId,
        ...(validIds.length ? { socialProfileId: { notIn: validIds } } : {}),
      },
    }),
    ...(validIds.length
      ? [
          prisma.socialProfileAccess.createMany({
            data: validIds.map((socialProfileId) => ({ userId, socialProfileId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return validIds.length;
}
