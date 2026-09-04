const ED25519_KEY_TYPE = "ssh-ed25519"
const ED25519_PUBLIC_KEY_BYTES = 32
const LENGTH_PREFIX_BYTES = 4
const BASE64_PADDING_RE = /=+$/
const WHITESPACE_RE = /\s+/

const utf8 = new TextDecoder()

export class PublicKeyNotEd25519Error extends Error {
  readonly keyType: string

  constructor(keyType: string) {
    super(`${keyType || "unknown"} is not an ed25519 public key`)
    this.name = "PublicKeyNotEd25519Error"
    this.keyType = keyType
  }
}

export class PublicKeyMalformedError extends Error {
  constructor() {
    super("the public key is not a readable OpenSSH ed25519 key")
    this.name = "PublicKeyMalformedError"
  }
}

export interface Ed25519PublicKey {
  key: string
  fingerprint: string
}

interface Field {
  value: Uint8Array
  end: number
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

function readField(blob: Uint8Array, offset: number): Field | null {
  if (offset + LENGTH_PREFIX_BYTES > blob.length) {
    return null
  }

  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  const start = offset + LENGTH_PREFIX_BYTES
  const end = start + view.getUint32(offset)

  if (end > blob.length) {
    return null
  }

  return { value: blob.subarray(start, end), end }
}

async function fingerprintOf(blob: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", blob)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))

  return `SHA256:${base64.replace(BASE64_PADDING_RE, "")}`
}

function blobOf(key: string): Uint8Array<ArrayBuffer> {
  const [keyType, encoded] = key.split(WHITESPACE_RE)

  if (keyType !== ED25519_KEY_TYPE) {
    throw new PublicKeyNotEd25519Error(keyType ?? "")
  }

  const blob = encoded ? decodeBase64(encoded) : null

  if (!blob) {
    throw new PublicKeyMalformedError()
  }

  const header = readField(blob, 0)

  if (!header) {
    throw new PublicKeyMalformedError()
  }

  const declared = utf8.decode(header.value)

  if (declared !== ED25519_KEY_TYPE) {
    throw new PublicKeyNotEd25519Error(declared)
  }

  const material = readField(blob, header.end)

  if (
    !material ||
    material.value.length !== ED25519_PUBLIC_KEY_BYTES ||
    material.end !== blob.length
  ) {
    throw new PublicKeyMalformedError()
  }

  return blob
}

export async function readEd25519PublicKey(
  input: string
): Promise<Ed25519PublicKey> {
  const key = input.trim()

  if (!key) {
    throw new PublicKeyMalformedError()
  }

  return { key, fingerprint: await fingerprintOf(blobOf(key)) }
}

export async function fingerprintOfPublicKey(input: string): Promise<string> {
  const [, encoded] = input.trim().split(WHITESPACE_RE)
  const blob = encoded ? decodeBase64(encoded) : null

  if (!blob) {
    throw new PublicKeyMalformedError()
  }

  return await fingerprintOf(blob)
}
