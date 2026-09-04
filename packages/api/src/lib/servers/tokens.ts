export const SERVER_TOKEN_PREFIX = "pupitre_srv_"

const SERVER_TOKEN_BYTES = 32
const BASE64_PADDING_RE = /=+$/

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_RE, "")
}

export function generateServerToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SERVER_TOKEN_BYTES))

  return `${SERVER_TOKEN_PREFIX}${base64Url(bytes)}`
}

export function isServerToken(value: string): boolean {
  return value.startsWith(SERVER_TOKEN_PREFIX)
}

export async function hashServerToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  )

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}
