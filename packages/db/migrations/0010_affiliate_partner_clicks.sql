-- AlterTable
ALTER TABLE "AffiliateLink" ADD COLUMN "partnerName" TEXT;
ALTER TABLE "AffiliateLink" ADD COLUMN "partnerEmail" TEXT;
ALTER TABLE "AffiliateLink" ADD COLUMN "notes" TEXT;
ALTER TABLE "AffiliateLink" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AffiliateClickDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "linkId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AffiliateClickDay_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateClickDay_linkId_day_key" ON "AffiliateClickDay"("linkId", "day");

-- CreateIndex
CREATE INDEX "AffiliateClickDay_day_idx" ON "AffiliateClickDay"("day");
