export interface R2StorageConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
}

export type R2PresignMethod = "GET" | "PUT"

export interface R2PresignInput {
  config: R2StorageConfig
  method: R2PresignMethod
  key: string
  ttlSeconds: number
  /** Extra signed parameters, such as the `response-*` overrides a GET may carry. */
  query?: Record<string, string>
  now: Date
}

const ALGORITHM = "AWS4-HMAC-SHA256"

const REGION = "auto"

const SERVICE = "s3"

const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"

const SIGNED_HEADERS = "host"

const AMZ_DATE_NOISE_RE = /[:-]|\.\d{3}/g

const RFC3986_EXTRA_RE = /[!'()*]/g

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
}

async function hmac(key: BufferSource, value: string): Promise<ArrayBuffer> {
  const signingKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  return await crypto.subtle.sign("HMAC", signingKey, encoder.encode(value))
}

function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    RFC3986_EXTRA_RE,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

export function encodeR2Path(key: string): string {
  return key.split("/").map(encodeComponent).join("/")
}

function amzDateOf(now: Date): string {
  return now.toISOString().replace(AMZ_DATE_NOISE_RE, "")
}

async function signingKeyFor(
  secretAccessKey: string,
  date: string
): Promise<ArrayBuffer> {
  const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), date)
  const regionKey = await hmac(dateKey, REGION)
  const serviceKey = await hmac(regionKey, SERVICE)

  return await hmac(serviceKey, "aws4_request")
}

function canonicalQuery(entries: [string, string][]): string {
  return entries
    .map(
      ([name, value]) => `${encodeComponent(name)}=${encodeComponent(value)}`
    )
    .sort()
    .join("&")
}

export async function presignR2({
  config,
  method,
  key,
  ttlSeconds,
  query = {},
  now,
}: R2PresignInput): Promise<string> {
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const amzDate = amzDateOf(now)
  const date = amzDate.slice(0, 8)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const path = `/${encodeR2Path(config.bucketName)}/${encodeR2Path(key)}`
  const signedQuery = canonicalQuery([
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(ttlSeconds)],
    ["X-Amz-SignedHeaders", SIGNED_HEADERS],
    ...Object.entries(query),
  ])

  const canonicalRequest = [
    method,
    path,
    signedQuery,
    `host:${host}\n`,
    SIGNED_HEADERS,
    UNSIGNED_PAYLOAD,
  ].join("\n")

  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n")

  const signature = toHex(
    await hmac(await signingKeyFor(config.secretAccessKey, date), stringToSign)
  )

  return `https://${host}${path}?${signedQuery}&X-Amz-Signature=${signature}`
}

export function r2ConfigFromEnv(
  bucketVariable: string
): R2StorageConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucketName = process.env[bucketVariable]

  if (!(accountId && accessKeyId && secretAccessKey && bucketName)) {
    return null
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName }
}
