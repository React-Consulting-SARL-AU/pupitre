-- AlterTable
ALTER TABLE "Server" ADD COLUMN "keyReport" JSONB;

-- CreateTable
CREATE TABLE "KeyApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signer" TEXT NOT NULL,
    "issuedAt" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeyApproval_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeyApproval_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeyApproval_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KeyApproval_deviceId_idx" ON "KeyApproval"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "KeyApproval_serverId_deviceId_signer_key" ON "KeyApproval"("serverId", "deviceId", "signer");
