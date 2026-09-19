-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StripeEvent" ADD COLUMN "subscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "StripeEvent_subscriptionId_idx" ON "StripeEvent"("subscriptionId");
