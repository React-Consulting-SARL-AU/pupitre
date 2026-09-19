-- CreateTable
CREATE TABLE "MailThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "normalizedSubject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "assignedUserId" TEXT,
    "contactUserId" TEXT,
    "lastInboundAt" DATETIME,
    "lastOutboundAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmails" JSONB NOT NULL,
    "ccEmails" JSONB NOT NULL,
    "subject" TEXT,
    "text" TEXT,
    "snippet" TEXT,
    "htmlKey" TEXT,
    "rawKey" TEXT,
    "rawHash" TEXT,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT,
    "sentByUserId" TEXT,
    "delivery" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MailAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MailThread_status_updatedAt_idx" ON "MailThread"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "MailThread_address_normalizedSubject_idx" ON "MailThread"("address", "normalizedSubject");

-- CreateIndex
CREATE INDEX "MailThread_assignedUserId_idx" ON "MailThread"("assignedUserId");

-- CreateIndex
CREATE INDEX "MailThread_contactUserId_idx" ON "MailThread"("contactUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_rawHash_key" ON "MailMessage"("rawHash");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_messageId_key" ON "MailMessage"("messageId");

-- CreateIndex
CREATE INDEX "MailMessage_threadId_createdAt_idx" ON "MailMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "MailAttachment_messageId_idx" ON "MailAttachment"("messageId");

