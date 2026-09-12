-- RedefineTables
PRAGMA defer_foreign_keys=ON;
CREATE TABLE "new_AppRelease" (
    "version" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "arch" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "signature" TEXT,
    "notes" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'beta',
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("version", "os", "arch", "format")
);
INSERT INTO "new_AppRelease" ("arch", "bytes", "channel", "format", "notes", "os", "publishedAt", "r2Key", "sha256", "signature", "version") SELECT "arch", "bytes", "channel", "format", "notes", "os", "publishedAt", "r2Key", "sha256", "signature", "version" FROM "AppRelease";
DROP TABLE "AppRelease";
ALTER TABLE "new_AppRelease" RENAME TO "AppRelease";
CREATE INDEX "AppRelease_channel_publishedAt_idx" ON "AppRelease"("channel", "publishedAt");
PRAGMA defer_foreign_keys=OFF;

