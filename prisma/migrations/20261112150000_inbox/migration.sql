-- CreateTable
CREATE TABLE "InboxThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "socialProfileId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalThreadId" TEXT NOT NULL,
    "subject" TEXT,
    "permalink" TEXT,
    "participantName" TEXT,
    "participantAvatar" TEXT,
    "participantExternalId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "authorName" TEXT,
    "authorExternalId" TEXT,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "permalink" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "remoteCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxThread_tenantId_platform_kind_externalThreadId_key" ON "InboxThread"("tenantId", "platform", "kind", "externalThreadId");

-- CreateIndex
CREATE INDEX "InboxThread_tenantId_lastMessageAt_idx" ON "InboxThread"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_externalId_key" ON "InboxMessage"("externalId");

-- CreateIndex
CREATE INDEX "InboxMessage_threadId_remoteCreatedAt_idx" ON "InboxMessage"("threadId", "remoteCreatedAt");

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_socialProfileId_fkey" FOREIGN KEY ("socialProfileId") REFERENCES "SocialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "InboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
