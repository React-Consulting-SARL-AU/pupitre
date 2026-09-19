-- CreateTable
CREATE TABLE IF NOT EXISTS "MailMailbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "signature" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "canReply" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MailMailbox_address_key" ON "MailMailbox"("address");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MailMailbox_sortOrder_idx" ON "MailMailbox"("sortOrder");

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailNote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MailNote_threadId_createdAt_idx" ON "MailNote"("threadId", "createdAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "to" JSONB,
    "cc" JSONB,
    "attachments" JSONB,
    "updatedByUserId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailDraft_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MailDraft_threadId_key" ON "MailDraft"("threadId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailActivity_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MailActivity_threadId_createdAt_idx" ON "MailActivity"("threadId", "createdAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mailboxId" TEXT,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailTemplate_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "MailMailbox" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MailTemplate_mailboxId_idx" ON "MailTemplate"("mailboxId");

-- AlterTable
ALTER TABLE "MailThread" ADD COLUMN "mailboxId" TEXT REFERENCES "MailMailbox" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "MailThread" ADD COLUMN "linkedOrganizationId" TEXT REFERENCES "organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "MailThread" ADD COLUMN "lastInboundAutomated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MailThread_mailboxId_idx" ON "MailThread"("mailboxId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MailThread_linkedOrganizationId_idx" ON "MailThread"("linkedOrganizationId");

-- The four legal boxes, with the identifiers `@pupitre/shared/platform` names.
INSERT OR IGNORE INTO "MailMailbox" ("id", "address", "displayName", "sensitive", "canReply", "enabled", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('mbx_support', 'support@pupitre.studio', 'Support', false, true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mbx_legal', 'legal@pupitre.studio', 'Juridique', true, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mbx_privacy', 'privacy@pupitre.studio', 'Données personnelles', true, true, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mbx_security', 'security@pupitre.studio', 'Sécurité', true, true, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Every thread already filed on one of these addresses joins its box.
UPDATE "MailThread"
SET "mailboxId" = (SELECT "id" FROM "MailMailbox" WHERE "MailMailbox"."address" = "MailThread"."address")
WHERE "mailboxId" IS NULL;

-- The open view drops the automated threads: a thread received before this
-- migration must carry its own last inbound, not the column's default.
UPDATE "MailThread"
SET "lastInboundAutomated" = COALESCE((
    SELECT "automated" FROM "MailMessage"
    WHERE "MailMessage"."threadId" = "MailThread"."id" AND "MailMessage"."direction" = 'inbound'
    ORDER BY "MailMessage"."createdAt" DESC
    LIMIT 1
), false);
