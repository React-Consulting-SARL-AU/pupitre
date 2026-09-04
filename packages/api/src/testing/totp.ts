// biome-ignore-all lint/suspicious/noBitwiseOperators: RFC 4226 dynamic truncation and base32 are defined on bits.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const DEFAULT_PERIOD = 30
const DEFAULT_DIGITS = 6
const BITS_PER_CHARACTER = 5
const BYTE_BITS = 8

function decodeBase32(value: string): Uint8Array {
  const cleaned = value.replaceAll("=", "").toUpperCase()
  const bytes: number[] = []
  let buffer = 0
  let bits = 0

  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character)

    if (index < 0) {
      throw new Error(`not base32: ${character}`)
    }

    buffer = (buffer << BITS_PER_CHARACTER) | index
    bits += BITS_PER_CHARACTER

    if (bits >= BYTE_BITS) {
      bits -= BYTE_BITS
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  return Uint8Array.from(bytes)
}

export function totpSecretFrom(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret")

  if (!secret) {
    throw new Error("no secret in the TOTP URI")
  }

  return secret
}

export async function totpCode(
  secret: string,
  atMs: number = Date.now()
): Promise<string> {
  const counter = new Uint8Array(8)

  new DataView(counter.buffer).setBigUint64(
    0,
    BigInt(Math.floor(atMs / 1000 / DEFAULT_PERIOD)),
    false
  )

  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase32(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  )
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter))
  const offset = (digest.at(-1) ?? 0) & 0x0f
  const truncated =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]

  return String(truncated % 10 ** DEFAULT_DIGITS).padStart(DEFAULT_DIGITS, "0")
}
