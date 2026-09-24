-- AlterTable
ALTER TABLE "Server" ADD COLUMN "backup" JSONB;

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backupId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serverId" TEXT,
    "serverName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "declaredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "counts" JSONB NOT NULL,
    "configRevision" INTEGER NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "kdfSalt" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "pathStyle" BOOLEAN NOT NULL,
    "manifestSha256" TEXT NOT NULL,
    "forgottenAt" DATETIME,
    CONSTRAINT "Backup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Backup_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Backup_organizationId_createdAt_idx" ON "Backup"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Backup_serverId_idx" ON "Backup"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Backup_organizationId_backupId_key" ON "Backup"("organizationId", "backupId");
