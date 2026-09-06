-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "enrollmentKey" TEXT;

-- A duplicate quadruplet predates the constraint: key its newest row only, so the migration never fails on data the bug created.
UPDATE "Server" AS s
SET "enrollmentKey" = keyed."enrollmentKey"
FROM (
  SELECT
    "id",
    "organizationId" || ':' || "port" || ':' || "deviceId" || ':' || "host" AS "enrollmentKey",
    row_number() OVER (
      PARTITION BY "organizationId", "port", "deviceId", "host"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS "rank"
  FROM "Server"
  WHERE "status" IN ('enrolling', 'active', 'grace', 'suspended')
    AND "host" IS NOT NULL
    AND "deviceId" IS NOT NULL
) AS keyed
WHERE s."id" = keyed."id" AND keyed."rank" = 1;

-- CreateIndex
CREATE UNIQUE INDEX "Server_enrollmentKey_key" ON "Server"("enrollmentKey");
