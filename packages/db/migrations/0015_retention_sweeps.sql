-- CreateIndex
CREATE INDEX "ServerMetric_at_idx" ON "ServerMetric"("at");

-- A forgotten backup reference is now deleted, never hidden: the ones hidden before go too.
DELETE FROM "Backup" WHERE "forgottenAt" IS NOT NULL;
