-- Hand-written: every change keeps MailThread and MailMessage in place, which
-- MailNote, MailDraft, MailActivity and MailAttachment point at.

-- AlterTable
ALTER TABLE "MailMessage" ADD COLUMN "address" TEXT;

-- AlterTable
ALTER TABLE "MailMessage" ADD COLUMN "authenticated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MailThread" ADD COLUMN "senderEmail" TEXT;

-- AlterTable
ALTER TABLE "MailThread" ADD COLUMN "senderName" TEXT;

-- AlterTable
ALTER TABLE "MailThread" ADD COLUMN "senderAuthenticated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MailThread" ADD COLUMN "snippet" TEXT;

-- A message is filed under the address its thread was written to.
UPDATE "MailMessage"
SET "address" = (SELECT "address" FROM "MailThread" WHERE "MailThread"."id" = "MailMessage"."threadId");

-- What we sent is ours; what came in before this migration was never checked, and stays unverified.
UPDATE "MailMessage" SET "authenticated" = true WHERE "direction" = 'outbound';

-- The same Message-ID may reach two of our addresses: it is unique per address, not across the inbox.
DROP INDEX IF EXISTS "MailMessage_messageId_key";

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_messageId_address_key" ON "MailMessage"("messageId", "address");

-- The list reads its sender and snippet from the thread: each thread gets its own, as the messages said them.
UPDATE "MailThread"
SET
    "senderEmail" = COALESCE(
        (
            SELECT "fromEmail" FROM "MailMessage"
            WHERE "MailMessage"."threadId" = "MailThread"."id" AND "MailMessage"."direction" = 'inbound'
            ORDER BY "MailMessage"."createdAt" DESC
            LIMIT 1
        ),
        (
            SELECT COALESCE(json_extract("toEmails", '$[0]'), "fromEmail") FROM "MailMessage"
            WHERE "MailMessage"."threadId" = "MailThread"."id"
            ORDER BY "MailMessage"."createdAt" DESC
            LIMIT 1
        )
    ),
    "senderName" = (
        SELECT "fromName" FROM "MailMessage"
        WHERE "MailMessage"."threadId" = "MailThread"."id" AND "MailMessage"."direction" = 'inbound'
        ORDER BY "MailMessage"."createdAt" DESC
        LIMIT 1
    ),
    "senderAuthenticated" = NOT EXISTS (
        SELECT 1 FROM "MailMessage"
        WHERE "MailMessage"."threadId" = "MailThread"."id" AND "MailMessage"."direction" = 'inbound'
    ),
    "snippet" = (
        SELECT "snippet" FROM "MailMessage"
        WHERE "MailMessage"."threadId" = "MailThread"."id"
        ORDER BY "MailMessage"."createdAt" DESC
        LIMIT 1
    );

-- A missing subject is stored empty and named by the console, not written in French into the data.
UPDATE "MailThread" SET "subject" = '', "normalizedSubject" = '' WHERE "subject" = '(sans objet)';
