export const SERVER_TOKEN_PREFIX = "pupitre_srv_"

export const ENROLLMENT_TOKEN_PREFIX = "pupitre_enr_"

const TOKEN_BYTES = 32
const BASE64_PADDING_RE = /=+$/

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_RE, "")
}

function randomToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))

  return `${prefix}${base64Url(bytes)}`
}

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(value))
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("")
    )
}

export function generateServerToken(): string {
  return randomToken(SERVER_TOKEN_PREFIX)
}

export function generateEnrollmentToken(): string {
  return randomToken(ENROLLMENT_TOKEN_PREFIX)
}

export function isServerToken(value: string): boolean {
  return value.startsWith(SERVER_TOKEN_PREFIX)
}

export function hashServerToken(token: string): Promise<string> {
  return sha256Hex(token)
}

export function hashEnrollmentToken(token: string): Promise<string> {
  return sha256Hex(token)
}
