-- The window each server still holds moves aside before the column goes: the
-- table that replaces it cannot exist yet, because dropping the old Server
-- cascades into its children, backfilled rows included.
CREATE TABLE "metrics_window" (
    "serverId" TEXT NOT NULL PRIMARY KEY,
    "metrics" JSONB
);
INSERT INTO "metrics_window" ("serverId", "metrics")
SELECT "id", "metrics" FROM "Server"
WHERE "metrics" IS NOT NULL AND json_valid("metrics");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
CREATE TABLE "new_Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 22,
    "sshUser" TEXT NOT NULL DEFAULT 'dev',
    "hostFingerprint" TEXT,
    "arch" TEXT NOT NULL,
    "agentVersion" TEXT,
    "targetVersion" TEXT,
    "serverTokenHash" TEXT,
    "enrollmentTokenHash" TEXT,
    "enrollmentKey" TEXT,
    "enrollmentExpiresAt" DATETIME,
    "entitlementValidUntil" DATETIME,
    "decommissionAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'enrolling',
    "suspendedReason" TEXT,
    "suspendedByOrganization" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "deviceId" TEXT,
    "assignedUserId" TEXT,
    "pendingAssignmentEmail" TEXT,
    "lastHeartbeatAt" DATETIME,
    "lastUsage" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Server_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Server_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Server_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Server" ("agentVersion", "arch", "assignedUserId", "channel", "createdAt", "decommissionAt", "deviceId", "enrollmentExpiresAt", "enrollmentKey", "enrollmentTokenHash", "entitlementValidUntil", "host", "hostFingerprint", "id", "lastHeartbeatAt", "lastUsage", "name", "organizationId", "pendingAssignmentEmail", "port", "serverTokenHash", "sshUser", "status", "suspendedByOrganization", "suspendedReason", "targetVersion", "updatedAt") SELECT "agentVersion", "arch", "assignedUserId", "channel", "createdAt", "decommissionAt", "deviceId", "enrollmentExpiresAt", "enrollmentKey", "enrollmentTokenHash", "entitlementValidUntil", "host", "hostFingerprint", "id", "lastHeartbeatAt", "lastUsage", "name", "organizationId", "pendingAssignmentEmail", "port", "serverTokenHash", "sshUser", "status", "suspendedByOrganization", "suspendedReason", "targetVersion", "updatedAt" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
CREATE UNIQUE INDEX "Server_serverTokenHash_key" ON "Server"("serverTokenHash");
CREATE UNIQUE INDEX "Server_enrollmentTokenHash_key" ON "Server"("enrollmentTokenHash");
CREATE UNIQUE INDEX "Server_enrollmentKey_key" ON "Server"("enrollmentKey");
CREATE INDEX "Server_organizationId_idx" ON "Server"("organizationId");
CREATE INDEX "Server_assignedUserId_idx" ON "Server"("assignedUserId");
CREATE INDEX "Server_deviceId_idx" ON "Server"("deviceId");
CREATE INDEX "Server_status_idx" ON "Server"("status");
CREATE INDEX "Server_decommissionAt_idx" ON "Server"("decommissionAt");
CREATE INDEX "Server_pendingAssignmentEmail_idx" ON "Server"("pendingAssignmentEmail");
CREATE INDEX "Server_lastHeartbeatAt_idx" ON "Server"("lastHeartbeatAt");
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "ServerMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "sample" JSONB NOT NULL,
    CONSTRAINT "ServerMetric_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The window aside becomes the rows that replace it, read for read. The
-- timestamp trades its trailing Z for the +00:00 the client writes, so every
-- row in the table sorts the same way.
INSERT INTO "ServerMetric" ("id", "serverId", "at", "sample")
SELECT lower(hex(randomblob(25))), "metrics_window"."serverId", replace(json_extract("entry"."value", '$.at'), 'Z', '+00:00'), "entry"."value"
FROM "metrics_window", json_each("metrics_window"."metrics", '$.samples') AS "entry";

DROP TABLE "metrics_window";

-- CreateIndex
CREATE INDEX "ServerMetric_serverId_at_idx" ON "ServerMetric"("serverId", "at");

-- CreateIndex
CREATE INDEX "MailThread_unread_updatedAt_idx" ON "MailThread"("unread", "updatedAt");
