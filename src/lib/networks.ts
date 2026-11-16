import { prisma } from "./prisma";

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
 * Reemplaza las redes asignadas a un usuario. Sólo se aceptan perfiles del pool
 * del administrador (`ownerTenantId`), así que un id inventado no da acceso a nada.
 */
export async function syncProfileAccess({
  userId,
  ownerTenantId,
  socialProfileIds,
}: {
  userId: string;
  ownerTenantId: string;
  socialProfileIds: string[];
}): Promise<number> {
  const wanted = [...new Set(socialProfileIds.filter(Boolean))];
  const valid = wanted.length
    ? await prisma.socialProfile.findMany({
        where: { id: { in: wanted }, tenantId: ownerTenantId },
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
