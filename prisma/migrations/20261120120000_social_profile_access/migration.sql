-- CreateTable
CREATE TABLE "SocialProfileAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socialProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialProfileAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialProfileAccess_userId_socialProfileId_key" ON "SocialProfileAccess"("userId", "socialProfileId");

-- CreateIndex
CREATE INDEX "SocialProfileAccess_socialProfileId_idx" ON "SocialProfileAccess"("socialProfileId");

-- AddForeignKey
ALTER TABLE "SocialProfileAccess" ADD CONSTRAINT "SocialProfileAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialProfileAccess" ADD CONSTRAINT "SocialProfileAccess_socialProfileId_fkey" FOREIGN KEY ("socialProfileId") REFERENCES "SocialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada usuario conserva el acceso que ya tenía a las redes de su cuenta.
-- El administrador puede después ajustar las asignaciones desde el panel.
INSERT INTO "SocialProfileAccess" ("id", "userId", "socialProfileId")
SELECT md5(random()::text || clock_timestamp()::text || u."id" || sp."id"), u."id", sp."id"
FROM "SocialProfile" sp
JOIN "User" u ON u."tenantId" = sp."tenantId"
ON CONFLICT ("userId", "socialProfileId") DO NOTHING;
