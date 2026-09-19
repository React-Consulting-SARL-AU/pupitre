import { EMAIL_DOMAIN } from "./config"

const LINE_LENGTH = 76

const BASE64_CHUNK = 0x80_00

const ASCII_RE = /^[\t\x20-\x7e]*$/

const FILENAME_NOISE_RE = /["\r\n]/g

function base64Bytes(bytes: Uint8Array): string {
  let binary = ""

  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + BASE64_CHUNK)
    )
  }

  return btoa(binary)
}

function base64(value: string): string {
  return base64Bytes(new TextEncoder().encode(value))
}

function wrap(value: string): string {
  const lines: string[] = []

  for (let index = 0; index < value.length; index += LINE_LENGTH) {
    lines.push(value.slice(index, index + LINE_LENGTH))
  }

  return lines.join("\r\n")
}

/** RFC 2047: a header that leaves ASCII travels base64-encoded or not at all. */
function encodeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim()

  return ASCII_RE.test(clean) ? clean : `=?UTF-8?B?${base64(clean)}?=`
}

export function generateMessageId(domain: string = EMAIL_DOMAIN): string {
  return `<${crypto.randomUUID()}@${domain}>`
}

export interface MimeAttachment {
  filename: string
  contentType: string
  content: ArrayBuffer
}

export interface MimeInput {
  from: string
  to: string | string[]
  cc?: string[]
  subject: string
  text: string
  html: string
  messageId?: string
  inReplyTo?: string | null
  references?: string | null
  date?: Date
  attachments?: MimeAttachment[]
}

function recipientList(value: string | string[]): string {
  return (Array.isArray(value) ? value : [value]).join(", ")
}

function boundary(): string {
  return `pupitre-${crypto.randomUUID()}`
}

function textPart(
  boundaryName: string,
  contentType: string,
  body: string
): string {
  return [
    `--${boundaryName}`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap(base64(body)),
    "",
  ].join("\r\n")
}

function attachmentPart(
  boundaryName: string,
  attachment: MimeAttachment
): string {
  const filename = attachment.filename.replace(FILENAME_NOISE_RE, "")

  return [
    `--${boundaryName}`,
    `Content-Type: ${attachment.contentType}; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap(base64Bytes(new Uint8Array(attachment.content))),
    "",
  ].join("\r\n")
}

function alternativeBody(
  text: string,
  html: string
): {
  contentType: string
  body: string
} {
  const boundaryName = boundary()

  return {
    contentType: `multipart/alternative; boundary="${boundaryName}"`,
    body: [
      textPart(boundaryName, "text/plain", text),
      textPart(boundaryName, "text/html", html),
      `--${boundaryName}--`,
    ].join("\r\n"),
  }
}

/** The text and HTML alternative becomes the first part of a mixed body, each attachment following it. */
function mixedBody(
  text: string,
  html: string,
  attachments: MimeAttachment[]
): { contentType: string; body: string } {
  const boundaryName = boundary()
  const alternative = alternativeBody(text, html)

  return {
    contentType: `multipart/mixed; boundary="${boundaryName}"`,
    body: [
      `--${boundaryName}`,
      `Content-Type: ${alternative.contentType}`,
      "",
      alternative.body,
      "",
      ...attachments.map((attachment) =>
        attachmentPart(boundaryName, attachment)
      ),
      `--${boundaryName}--`,
    ].join("\r\n"),
  }
}

export function buildMimeMessage({
  from,
  to,
  cc = [],
  subject,
  text,
  html,
  messageId = generateMessageId(),
  inReplyTo,
  references,
  date = new Date(),
  attachments = [],
}: MimeInput): string {
  const headers = [
    `From: ${encodeHeader(from)}`,
    `To: ${encodeHeader(recipientList(to))}`,
  ]

  if (cc.length > 0) {
    headers.push(`Cc: ${encodeHeader(recipientList(cc))}`)
  }

  headers.push(
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: ${encodeHeader(messageId)}`,
    `Date: ${date.toUTCString()}`
  )

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${encodeHeader(inReplyTo)}`)
  }

  if (references) {
    headers.push(`References: ${encodeHeader(references)}`)
  }

  const content =
    attachments.length > 0
      ? mixedBody(text, html, attachments)
      : alternativeBody(text, html)

  headers.push("MIME-Version: 1.0", `Content-Type: ${content.contentType}`)

  return [...headers, "", content.body, ""].join("\r\n")
}
