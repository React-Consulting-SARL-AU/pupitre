-- CreateEnum
CREATE TYPE "DesktopOs" AS ENUM ('macos', 'windows', 'linux');

-- CreateTable
CREATE TABLE "AppRelease" (
    "version" TEXT NOT NULL,
    "os" "DesktopOs" NOT NULL,
    "arch" TEXT,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "signature" TEXT,
    "notes" TEXT NOT NULL,
    "channel" "ReleaseChannel" NOT NULL DEFAULT 'beta',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppRelease_pkey" PRIMARY KEY ("version","os")
);

-- CreateIndex
CREATE INDEX "AppRelease_channel_publishedAt_idx" ON "AppRelease"("channel", "publishedAt");
