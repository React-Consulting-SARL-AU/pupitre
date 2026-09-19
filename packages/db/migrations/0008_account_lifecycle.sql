-- AlterTable
ALTER TABLE "user" ADD COLUMN "deactivatedAt" DATETIME;
ALTER TABLE "user" ADD COLUMN "deactivatedReason" TEXT;
ALTER TABLE "user" ADD COLUMN "deactivatedByUserId" TEXT;
ALTER TABLE "user" ADD COLUMN "deletionAt" DATETIME;
ALTER TABLE "user" ADD COLUMN "deletionReason" TEXT;
ALTER TABLE "user" ADD COLUMN "deletionByUserId" TEXT;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN "suspendedAt" DATETIME;
ALTER TABLE "organization" ADD COLUMN "suspendedReason" TEXT;
ALTER TABLE "organization" ADD COLUMN "suspendedByUserId" TEXT;
ALTER TABLE "organization" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "organization" ADD COLUMN "closedReason" TEXT;
ALTER TABLE "organization" ADD COLUMN "closedByUserId" TEXT;
ALTER TABLE "organization" ADD COLUMN "deletionAt" DATETIME;
ALTER TABLE "organization" ADD COLUMN "deletionReason" TEXT;
ALTER TABLE "organization" ADD COLUMN "deletionByUserId" TEXT;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN "suspendedByOrganization" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_deletionAt_idx" ON "user"("deletionAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "organization_deletionAt_idx" ON "organization"("deletionAt");
