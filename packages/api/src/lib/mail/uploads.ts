import {
  isBlockedAttachment,
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_MAX_OUTBOUND_ATTACHMENTS,
  MAIL_SIGNED_URL_TTL_SECONDS,
} from "@pupitre/shared/legal"
import {
  MAIL_UPLOADS_PREFIX,
  mailStorage,
  mailUploadKey,
  mailUploadPrefix,
} from "./storage"

export const MAIL_UPLOAD_MAX_AGE_MS = 24 * 3_600_000

export type MailAttachmentRefusal =
  | "blocked"
  | "too_large"
  | "missing"
  | "foreign"
  | "size_mismatch"

export class MailAttachmentRefusedError extends Error {
  readonly reason: MailAttachmentRefusal
  readonly filename: string

  constructor(reason: MailAttachmentRefusal, filename: string) {
    super(`attachment refused (${reason}): ${filename}`)
    this.name = "MailAttachmentRefusedError"
    this.reason = reason
    this.filename = filename
  }
}

export interface MailUploadInput {
  filename: string
  mime_type: string
  size: number
}

export interface MailUploadGrant {
  key: string
  url: string
  expires_at: Date
}

export interface MailAttachmentInput {
  key: string
  filename: string
  mime_type: string
  size: number
}

export interface MailUploadBytes {
  key: string
  filename: string
  mimeType: string
  body: ArrayBuffer
}

const PATH_TRAVERSAL_RE = /(^|\/)\.\.?(\/|$)/

export async function createMailUpload(
  userId: string,
  input: MailUploadInput,
  now: Date = new Date()
): Promise<MailUploadGrant> {
  if (isBlockedAttachment(input.filename)) {
    throw new MailAttachmentRefusedError("blocked", input.filename)
  }

  const key = mailUploadKey(userId, input.filename)
  const url = await (await mailStorage()).signedUrl("PUT", key, {
    ttlSeconds: MAIL_SIGNED_URL_TTL_SECONDS,
  })

  return {
    key,
    url,
    expires_at: new Date(now.getTime() + MAIL_SIGNED_URL_TTL_SECONDS * 1000),
  }
}

/** What the body declares is checked before the bucket is touched: count, total, names, and whose keys they are. */
export function assertMailAttachments(
  userId: string,
  attachments: MailAttachmentInput[]
): void {
  const total = attachments.reduce(
    (sum, attachment) => sum + attachment.size,
    0
  )

  if (
    attachments.length > MAIL_MAX_OUTBOUND_ATTACHMENTS ||
    total > MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES
  ) {
    throw new MailAttachmentRefusedError(
      "too_large",
      attachments.at(-1)?.filename ?? ""
    )
  }

  const prefix = mailUploadPrefix(userId)

  for (const attachment of attachments) {
    if (isBlockedAttachment(attachment.filename)) {
      throw new MailAttachmentRefusedError("blocked", attachment.filename)
    }

    if (
      !attachment.key.startsWith(prefix) ||
      PATH_TRAVERSAL_RE.test(attachment.key)
    ) {
      throw new MailAttachmentRefusedError("foreign", attachment.filename)
    }
  }
}

export async function readMailUploads(
  attachments: MailAttachmentInput[]
): Promise<MailUploadBytes[]> {
  const storage = await mailStorage()
  const read: MailUploadBytes[] = []

  for (const attachment of attachments) {
    const head = await storage.head(attachment.key)

    if (!head) {
      throw new MailAttachmentRefusedError("missing", attachment.filename)
    }

    if (head.size > attachment.size) {
      throw new MailAttachmentRefusedError("size_mismatch", attachment.filename)
    }

    const object = await storage.get(attachment.key)

    if (!object) {
      throw new MailAttachmentRefusedError("missing", attachment.filename)
    }

    read.push({
      key: attachment.key,
      filename: attachment.filename,
      mimeType: attachment.mime_type,
      body: object.body,
    })
  }

  return read
}

export async function deleteMailUploads(keys: string[]): Promise<void> {
  const storage = await mailStorage()

  for (const key of keys) {
    await storage.delete(key)
  }
}

/** An upload nobody sent within a day is abandoned: the console asked for the address and never came back. */
export async function purgeStaleMailUploads(
  now: Date = new Date()
): Promise<string[]> {
  const storage = await mailStorage()
  const cutoff = now.getTime() - MAIL_UPLOAD_MAX_AGE_MS
  const stale = (await storage.list(MAIL_UPLOADS_PREFIX))
    .filter((entry) => entry.uploaded.getTime() < cutoff)
    .map((entry) => entry.key)

  for (const key of stale) {
    await storage.delete(key)
  }

  return stale
}
