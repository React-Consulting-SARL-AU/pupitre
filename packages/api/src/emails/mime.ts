import { EMAIL_DOMAIN } from "./config"

const LINE_LENGTH = 76

const ASCII_RE = /^[\t\x20-\x7e]*$/

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
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

export interface MimeInput {
  from: string
  to: string
  subject: string
  text: string
  html: string
  messageId?: string
  date?: Date
}

export function buildMimeMessage({
  from,
  to,
  subject,
  text,
  html,
  messageId = generateMessageId(),
  date = new Date(),
}: MimeInput): string {
  const boundary = `pupitre-${crypto.randomUUID()}`
  const part = (contentType: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${contentType}; charset=UTF-8`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap(base64(body)),
      "",
    ].join("\r\n")

  return [
    `From: ${encodeHeader(from)}`,
    `To: ${encodeHeader(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${date.toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    part("text/plain", text),
    part("text/html", html),
    `--${boundary}--`,
    "",
  ].join("\r\n")
}
