-- Hand-written: Server, Alert and AffiliateLink stay in place, which every other table points at.

-- AlterTable
ALTER TABLE "Server" RENAME COLUMN "entitlementValidUntil" TO "licenseValidUntil";

-- AlterTable
ALTER TABLE "AffiliateLink" DROP COLUMN "freeMonths";

-- AlterTable
ALTER TABLE "AffiliateLink" DROP COLUMN "seats";

UPDATE "Alert" SET "kind" = 'license_grace' WHERE "kind" = 'entitlement_grace';

-- The free tier replaces the launch seat.
DELETE FROM "Subscription" WHERE "product" = 'launch';

-- A machine stopped for want of a subscription runs again once its organization fits in the free tier.
UPDATE "Server"
SET "status" = 'active', "suspendedReason" = NULL
WHERE ("status" = 'grace' OR ("status" = 'suspended' AND "suspendedReason" = 'billing'))
    AND "organizationId" NOT IN (
        SELECT "organizationId" FROM "Subscription" WHERE "status" IN ('active', 'trialing', 'past_due', 'unpaid')
    )
    AND "organizationId" IN (
        SELECT "organizationId" FROM "Server"
        WHERE "status" IN ('enrolling', 'active', 'grace', 'suspended')
        GROUP BY "organizationId"
        HAVING COUNT(*) <= 3
    );
