-- AlterTable
ALTER TABLE "Server" ADD COLUMN "lastUsage" JSONB;
ALTER TABLE "Server" ADD COLUMN "suspendedReason" TEXT;

-- Every suspension so far came from billing: no admin route existed.
UPDATE "Server" SET "suspendedReason" = 'billing' WHERE "status" = 'suspended';

-- The last sample of the metrics window, so the lists stop reading the window.
UPDATE "Server" SET "lastUsage" = (
    SELECT json_object(
        'at', json_extract("sample"."value", '$.at'),
        'disk', json_extract("sample"."value", '$.disk'),
        'ram', json_extract("sample"."value", '$.ram'),
        'load', json_extract("sample"."value", '$.load'),
        'disk_total_gb', json_extract("sample"."value", '$.disk_total_gb'),
        'disk_free_gb', json_extract("sample"."value", '$.disk_free_gb'),
        'ram_total_mb', json_extract("sample"."value", '$.ram_total_mb'),
        'ram_used_mb', json_extract("sample"."value", '$.ram_used_mb')
    )
    FROM json_each("Server"."metrics", '$.samples') AS "sample"
    ORDER BY "sample"."key" DESC
    LIMIT 1
) WHERE "metrics" IS NOT NULL AND json_valid("metrics");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
CREATE TABLE "new_StripeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);
INSERT INTO "new_StripeEvent" ("id", "type", "status", "receivedAt", "processedAt") SELECT "id", "type", 'processed', "processedAt", "processedAt" FROM "StripeEvent";
DROP TABLE "StripeEvent";
ALTER TABLE "new_StripeEvent" RENAME TO "StripeEvent";
PRAGMA defer_foreign_keys=OFF;
