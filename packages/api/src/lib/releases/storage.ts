export type ReleaseStorageKind = "r2" | "local"

export interface ReleaseStorage {
  readonly kind: ReleaseStorageKind
  signedUrl(key: string, ttlSeconds: number): Promise<string>
}

export interface R2StorageConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
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

function encodePath(key: string): string {
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

async function presign(
  config: R2StorageConfig,
  key: string,
  ttlSeconds: number,
  now: Date
): Promise<string> {
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const amzDate = amzDateOf(now)
  const date = amzDate.slice(0, 8)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const path = `/${encodePath(config.bucketName)}/${encodePath(key)}`

  const query = [
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(ttlSeconds)],
    ["X-Amz-SignedHeaders", SIGNED_HEADERS],
  ]
    .map(
      ([name, value]) => `${encodeComponent(name)}=${encodeComponent(value)}`
    )
    .sort()
    .join("&")

  const canonicalRequest = [
    "GET",
    path,
    query,
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

  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`
}

export function createR2ReleaseStorage(
  config: R2StorageConfig
): ReleaseStorage {
  return {
    kind: "r2",
    signedUrl: (key, ttlSeconds) =>
      presign(config, key, ttlSeconds, new Date()),
  }
}

export function createLocalReleaseStorage(): ReleaseStorage {
  return {
    kind: "local",
    signedUrl: (key, ttlSeconds) => {
      const expires = Math.floor(Date.now() / 1000) + ttlSeconds

      return Promise.resolve(
        `http://localhost/__release-storage/${encodePath(key)}?expires=${expires}&signature=local`
      )
    },
  }
}

function r2ConfigFromEnv(): R2StorageConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucketName = process.env.R2_BUCKET_NAME

  if (!(accountId && accessKeyId && secretAccessKey && bucketName)) {
    return null
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName }
}

export function createReleaseStorage(): ReleaseStorage {
  const config = r2ConfigFromEnv()

  return config ? createR2ReleaseStorage(config) : createLocalReleaseStorage()
}

let configured: ReleaseStorage | null = null

export function configureReleaseStorage(storage: ReleaseStorage): void {
  configured = storage
}

export function getReleaseStorage(): ReleaseStorage {
  configured ??= createReleaseStorage()

  return configured
}
