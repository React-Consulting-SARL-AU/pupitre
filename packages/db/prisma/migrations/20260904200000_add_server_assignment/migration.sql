-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "pendingAssignmentEmail" TEXT;

-- CreateTable
CREATE TABLE "ServerRevokedDevice" (
    "serverId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerRevokedDevice_pkey" PRIMARY KEY ("serverId","deviceId")
);

-- CreateIndex
CREATE INDEX "ServerRevokedDevice_deviceId_idx" ON "ServerRevokedDevice"("deviceId");

-- CreateIndex
CREATE INDEX "Server_pendingAssignmentEmail_idx" ON "Server"("pendingAssignmentEmail");

-- AddForeignKey
ALTER TABLE "ServerRevokedDevice" ADD CONSTRAINT "ServerRevokedDevice_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerRevokedDevice" ADD CONSTRAINT "ServerRevokedDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
