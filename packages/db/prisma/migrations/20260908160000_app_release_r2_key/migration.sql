-- A published artefact is named by its key in the downloads bucket, not by an
-- address: the platform composes the URL from the bucket it owns.
ALTER TABLE "AppRelease" RENAME COLUMN "url" TO "r2Key";
