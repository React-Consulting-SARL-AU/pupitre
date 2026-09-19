import {
  isPreviewableMailType,
  MAIL_SIGNED_URL_TTL_SECONDS,
} from "@pupitre/shared/legal"
import { getPrisma } from "../api/prisma"
import { safeFilename } from "./parse"
import { mailStorage } from "./storage"

export type MailAttachmentDisposition = "inline" | "attachment"

export interface MailAttachmentUrl {
  url: string
  expires_at: Date
  mime_type: string
  filename: string
  size: number
}

interface StoredAttachment {
  key: string
  filename: string
  mimeType: string
}

const DEFAULT_ATTACHMENT_TYPE = "application/octet-stream"

/**
 * What a browser is told a downloaded attachment is. Anything else — SVG, XML,
 * HTML, a type a sender invented — is served as bytes to save, never as a
 * document.
 */
const SERVED_ATTACHMENT_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
])

const CID_SRC_RE =
  /(\ssrc\s*=\s*)(?:"cid:([^"]*)"|'cid:([^']*)'|cid:([^\s>]+))/gi

const HTML_ATTRIBUTE_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
}

const HTML_ATTRIBUTE_RE = /[&"<]/g

function declaredType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase()
}

export function servedAttachmentType(mimeType: string): string {
  const declared = declaredType(mimeType)

  return SERVED_ATTACHMENT_TYPES.has(declared)
    ? declared
    : DEFAULT_ATTACHMENT_TYPE
}

/**
 * `inline` only opens a raster image or a PDF, under its own type; anything
 * else is handed over as a file to save, under a type the browser will not
 * run. The bucket answers with what the signed address asks.
 */
function responseFor(
  attachment: StoredAttachment,
  disposition: MailAttachmentDisposition
): { disposition: string; contentType: string } {
  const filename = safeFilename(attachment.filename)

  if (disposition === "inline" && isPreviewableMailType(attachment.mimeType)) {
    return {
      disposition: `inline; filename="${filename}"`,
      contentType: declaredType(attachment.mimeType),
    }
  }

  return {
    disposition: `attachment; filename="${filename}"`,
    contentType: servedAttachmentType(attachment.mimeType),
  }
}

async function signedAttachmentUrl(
  attachment: StoredAttachment,
  disposition: MailAttachmentDisposition
): Promise<{ url: string; contentType: string }> {
  const response = responseFor(attachment, disposition)
  const url = await (await mailStorage()).signedUrl("GET", attachment.key, {
    ttlSeconds: MAIL_SIGNED_URL_TTL_SECONDS,
    disposition: response.disposition,
    contentType: response.contentType,
  })

  return { url, contentType: response.contentType }
}

export async function mailAttachmentUrl(
  attachmentId: string,
  disposition: MailAttachmentDisposition,
  now: Date = new Date()
): Promise<MailAttachmentUrl | null> {
  const attachment = await getPrisma().mailAttachment.findUnique({
    where: { id: attachmentId },
    select: { key: true, filename: true, mimeType: true, size: true },
  })

  if (!attachment) {
    return null
  }

  const signed = await signedAttachmentUrl(attachment, disposition)

  return {
    url: signed.url,
    expires_at: new Date(now.getTime() + MAIL_SIGNED_URL_TTL_SECONDS * 1000),
    mime_type: signed.contentType,
    filename: attachment.filename,
    size: attachment.size,
  }
}

function escapeAttribute(value: string): string {
  return value.replace(
    HTML_ATTRIBUTE_RE,
    (char) => HTML_ATTRIBUTE_ESCAPES[char]
  )
}

function referencedContentIds(html: string): Set<string> {
  const ids = new Set<string>()

  for (const match of html.matchAll(CID_SRC_RE)) {
    ids.add(match[2] ?? match[3] ?? match[4])
  }

  return ids
}

/** A `src="cid:…"` becomes the signed inline address of the part carrying that Content-ID; an unknown one is left as it came. */
export function rewriteInlineImages(
  html: string,
  urls: Map<string, string>
): string {
  return html.replace(CID_SRC_RE, (match, prefix: string, ...groups) => {
    const contentId = groups.find(
      (group): group is string => typeof group === "string"
    )
    const url = contentId === undefined ? undefined : urls.get(contentId)

    return url === undefined ? match : `${prefix}"${escapeAttribute(url)}"`
  })
}

export async function readMailMessageHtml(
  messageId: string
): Promise<string | null> {
  const message = await getPrisma().mailMessage.findUnique({
    where: { id: messageId },
    select: {
      htmlKey: true,
      attachments: {
        where: { contentId: { not: null } },
        select: { key: true, filename: true, mimeType: true, contentId: true },
      },
    },
  })

  if (!message?.htmlKey) {
    return null
  }

  const object = await (await mailStorage()).get(message.htmlKey)

  if (!object) {
    return null
  }

  const html = new TextDecoder().decode(object.body)
  const referenced = referencedContentIds(html)
  const urls = new Map<string, string>()

  for (const attachment of message.attachments) {
    if (attachment.contentId && referenced.has(attachment.contentId)) {
      urls.set(
        attachment.contentId,
        (await signedAttachmentUrl(attachment, "inline")).url
      )
    }
  }

  return urls.size === 0 ? html : rewriteInlineImages(html, urls)
}
