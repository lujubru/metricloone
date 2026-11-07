-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fbAppId" TEXT,
    "fbAppSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FbConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fbUserId" TEXT,
    "fbUserName" TEXT,
    "userAccessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FbConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "FbConnection_tenantId_key" ON "FbConnection"("tenantId");

-- Tenant por defecto que absorbe los datos existentes
INSERT INTO "Tenant" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('tenant_default', 'Cuenta principal', 'principal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- AlterTable User
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'CLIENT',
ADD COLUMN     "tenantId" TEXT;

-- Los usuarios existentes pasan a ser administradores del tenant por defecto
UPDATE "User" SET "tenantId" = 'tenant_default', "role" = 'ADMIN' WHERE "tenantId" IS NULL;

-- AlterTable SocialProfile
DROP INDEX IF EXISTS "SocialProfile_platform_profileId_key";
ALTER TABLE "SocialProfile" DROP CONSTRAINT "SocialProfile_userId_fkey";
ALTER TABLE "SocialProfile" ADD COLUMN     "parentProfileId" TEXT,
ADD COLUMN     "tenantId" TEXT;
UPDATE "SocialProfile" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
ALTER TABLE "SocialProfile" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SocialProfile" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable Post
ALTER TABLE "Post" DROP CONSTRAINT "Post_userId_fkey";
ALTER TABLE "Post" ADD COLUMN     "tenantId" TEXT;
UPDATE "Post" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
ALTER TABLE "Post" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Post" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "SocialProfile_tenantId_idx" ON "SocialProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialProfile_tenantId_platform_profileId_key" ON "SocialProfile"("tenantId", "platform", "profileId");

-- CreateIndex
CREATE INDEX "Post_tenantId_scheduledFor_idx" ON "Post"("tenantId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FbConnection" ADD CONSTRAINT "FbConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La conexión de Facebook existente (NextAuth) pasa a ser la conexión del tenant por defecto
INSERT INTO "FbConnection" ("id", "tenantId", "fbUserId", "fbUserName", "userAccessToken", "tokenExpiresAt", "createdAt", "updatedAt")
SELECT 'fbconn_default', 'tenant_default', a."providerAccountId", u."name", a."access_token", NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Account" a
JOIN "User" u ON u."id" = a."userId"
WHERE a."provider" = 'facebook' AND a."access_token" IS NOT NULL
ORDER BY a."expires_at" DESC NULLS LAST
LIMIT 1;
