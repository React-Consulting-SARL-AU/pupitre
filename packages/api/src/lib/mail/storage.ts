import { workerEnv } from "../../emails/send"
import {
  encodeR2Path,
  presignR2,
  type R2StorageConfig,
  r2ConfigFromEnv,
} from "../storage/r2-presign"
import { safeFilename } from "./parse"

export interface MailObject {
  body: ArrayBuffer
  contentType: string
}

export interface MailObjectHead {
  size: number
  contentType: string
}

export interface MailObjectEntry {
  key: string
  uploaded: Date
}

export type MailSignedMethod = "GET" | "PUT"

export interface MailSignedUrlOptions {
  ttlSeconds: number
  disposition?: string
  contentType?: string
}

export type MailUrlSigner = (
  method: MailSignedMethod,
  key: string,
  options: MailSignedUrlOptions
) => Promise<string>

export interface MailStorage {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>
  get(key: string): Promise<MailObject | null>
  head(key: string): Promise<MailObjectHead | null>
  list(prefix: string): Promise<MailObjectEntry[]>
  delete(key: string): Promise<void>
  signedUrl: MailUrlSigner
}

interface R2ObjectLike {
  key: string
  size: number
  uploaded: Date
  httpMetadata?: { contentType?: string }
}

interface R2Like {
  put(
    key: string,
    body: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>
  get(
    key: string
  ): Promise<(R2ObjectLike & { arrayBuffer(): Promise<ArrayBuffer> }) | null>
  head(key: string): Promise<R2ObjectLike | null>
  list(options: {
    prefix: string
    cursor?: string
  }): Promise<{ objects: R2ObjectLike[]; truncated: boolean; cursor?: string }>
  delete(key: string): Promise<void>
}

export const RAW_CONTENT_TYPE = "message/rfc822"

export const HTML_CONTENT_TYPE = "text/html; charset=utf-8"

export const MAIL_UPLOADS_PREFIX = "mail/uploads/"

const DEFAULT_CONTENT_TYPE = "application/octet-stream"

const MAIL_BUCKET_VARIABLE = "R2_MAIL_BUCKET_NAME"

const RESPONSE_DISPOSITION = "response-content-disposition"

const RESPONSE_CONTENT_TYPE = "response-content-type"

export class MailStorageMissingError extends Error {
  constructor() {
    super("no MAIL binding on the Worker: nothing can be stored or read back")
    this.name = "MailStorageMissingError"
  }
}

function mailPrefix(threadId: string, messageId: string): string {
  return `mail/${threadId}/${messageId}`
}

export function rawKeyFor(threadId: string, messageId: string): string {
  return `${mailPrefix(threadId, messageId)}/raw.eml`
}

export function outboundAttachmentKey(
  threadId: string,
  messageId: string,
  rank: number,
  filename: string
): string {
  return `${mailPrefix(threadId, messageId)}/attachments/${rank}/${safeFilename(filename)}`
}

/** Uploads are filed per user: the send checks the prefix against the caller. */
export function mailUploadPrefix(userId: string): string {
  return `${MAIL_UPLOADS_PREFIX}${userId}/`
}

export function mailUploadKey(userId: string, filename: string): string {
  return `${mailUploadPrefix(userId)}${crypto.randomUUID()}/${safeFilename(filename)}`
}

// Keyed by content hash, so a replayed delivery writes over itself instead of leaving the first attempt behind.
function inboundPrefix(rawHash: string): string {
  return `mail/inbound/${rawHash}`
}

export function inboundRawKey(rawHash: string): string {
  return `${inboundPrefix(rawHash)}/raw.eml`
}

export function inboundHtmlKey(rawHash: string): string {
  return `${inboundPrefix(rawHash)}/body.html`
}

export function inboundAttachmentKey(
  rawHash: string,
  rank: number,
  filename: string
): string {
  return `${inboundPrefix(rawHash)}/attachments/${rank}/${safeFilename(filename)}`
}

function responseQuery(options: MailSignedUrlOptions): Record<string, string> {
  return {
    ...(options.disposition
      ? { [RESPONSE_DISPOSITION]: options.disposition }
      : {}),
    ...(options.contentType
      ? { [RESPONSE_CONTENT_TYPE]: options.contentType }
      : {}),
  }
}

export function createMailUrlSigner(
  config: R2StorageConfig | null,
  now: () => Date = () => new Date()
): MailUrlSigner {
  if (config) {
    return (method, key, options) =>
      presignR2({
        config,
        method,
        key,
        ttlSeconds: options.ttlSeconds,
        query: responseQuery(options),
        now: now(),
      })
  }

  return (method, key, options) => {
    const expires = Math.floor(now().getTime() / 1000) + options.ttlSeconds
    const query = new URLSearchParams({
      method,
      expires: String(expires),
      ...responseQuery(options),
      signature: "local",
    })

    return Promise.resolve(
      `http://localhost/__mail-storage/${encodeR2Path(key)}?${query}`
    )
  }
}

let configured: MailStorage | null = null

export function configureMailStorage(storage: MailStorage): void {
  configured = storage
}

export function resetMailStorage(): void {
  configured = null
}

function isBucket(value: unknown): value is R2Like {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as R2Like).put === "function" &&
    typeof (value as R2Like).get === "function"
  )
}

async function listAll(
  bucket: R2Like,
  prefix: string
): Promise<MailObjectEntry[]> {
  const entries: MailObjectEntry[] = []
  let cursor: string | undefined

  do {
    const page = await bucket.list({ prefix, cursor })

    entries.push(
      ...page.objects.map((object) => ({
        key: object.key,
        uploaded: object.uploaded,
      }))
    )
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return entries
}

function bucketStorage(bucket: R2Like): MailStorage {
  return {
    put: async (key, body, contentType) => {
      await bucket.put(key, body, { httpMetadata: { contentType } })
    },
    get: async (key) => {
      const object = await bucket.get(key)

      if (!object) {
        return null
      }

      return {
        body: await object.arrayBuffer(),
        contentType: object.httpMetadata?.contentType ?? DEFAULT_CONTENT_TYPE,
      }
    },
    head: async (key) => {
      const object = await bucket.head(key)

      if (!object) {
        return null
      }

      return {
        size: object.size,
        contentType: object.httpMetadata?.contentType ?? DEFAULT_CONTENT_TYPE,
      }
    },
    list: (prefix) => listAll(bucket, prefix),
    delete: (key) => bucket.delete(key),
    signedUrl: createMailUrlSigner(r2ConfigFromEnv(MAIL_BUCKET_VARIABLE)),
  }
}

export async function mailStorage(): Promise<MailStorage> {
  if (configured) {
    return configured
  }

  const bucket = (await workerEnv())?.MAIL

  if (!isBucket(bucket)) {
    throw new MailStorageMissingError()
  }

  return bucketStorage(bucket)
}

export async function mailSignedUrl(
  method: MailSignedMethod,
  key: string,
  options: MailSignedUrlOptions
): Promise<string> {
  return await (await mailStorage()).signedUrl(method, key, options)
}
