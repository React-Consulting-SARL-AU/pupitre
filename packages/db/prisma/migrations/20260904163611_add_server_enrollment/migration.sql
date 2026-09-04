-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "decommissionAt" TIMESTAMP(3),
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "enrollmentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "enrollmentTokenHash" TEXT,
ADD COLUMN     "entitlementValidUntil" TIMESTAMP(3),
ADD COLUMN     "host" TEXT,
ADD COLUMN     "port" INTEGER NOT NULL DEFAULT 22,
ADD COLUMN     "sshUser" TEXT NOT NULL DEFAULT 'dev',
ADD COLUMN     "targetVersion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Server_enrollmentTokenHash_key" ON "Server"("enrollmentTokenHash");

-- CreateIndex
CREATE INDEX "Server_deviceId_idx" ON "Server"("deviceId");

-- CreateIndex
CREATE INDEX "Server_decommissionAt_idx" ON "Server"("decommissionAt");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

