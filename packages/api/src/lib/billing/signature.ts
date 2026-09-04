export const SIGNATURE_TOLERANCE_MS = 300_000

export type SignatureRefusal = "missing" | "malformed" | "stale" | "mismatch"

export interface SignatureVerdict {
  valid: boolean
  refusal?: SignatureRefusal
}

const encoder = new TextEncoder()

interface ParsedHeader {
  timestamp: number
  signatures: string[]
}

function parseHeader(header: string): ParsedHeader | null {
  let timestamp: number | null = null
  const signatures: string[] = []

  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=")

    if (!(key && value)) {
      continue
    }

    if (key === "t") {
      const seconds = Number.parseInt(value, 10)

      timestamp = Number.isNaN(seconds) ? null : seconds
    }

    if (key === "v1") {
      signatures.push(value)
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return null
  }

  return { timestamp, signatures }
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))

  return Array.from(new Uint8Array(signed), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

function equalsInConstantTime(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }

  let mismatches = 0

  for (let index = 0; index < left.length; index += 1) {
    mismatches += left.charCodeAt(index) === right.charCodeAt(index) ? 0 : 1
  }

  return mismatches === 0
}

export interface SignatureInput {
  payload: string
  header: string | null
  secret: string
  now?: Date
  toleranceMs?: number
}

export async function verifyStripeSignature({
  payload,
  header,
  secret,
  now = new Date(),
  toleranceMs = SIGNATURE_TOLERANCE_MS,
}: SignatureInput): Promise<SignatureVerdict> {
  if (!header) {
    return { valid: false, refusal: "missing" }
  }

  const parsed = parseHeader(header)

  if (!parsed) {
    return { valid: false, refusal: "malformed" }
  }

  const drift = Math.abs(now.getTime() - parsed.timestamp * 1000)

  if (drift > toleranceMs) {
    return { valid: false, refusal: "stale" }
  }

  const expected = await hmacHex(secret, `${parsed.timestamp}.${payload}`)
  const matched = parsed.signatures.some((signature) =>
    equalsInConstantTime(signature, expected)
  )

  return matched ? { valid: true } : { valid: false, refusal: "mismatch" }
}

export async function signStripePayload(
  payload: string,
  secret: string,
  now: Date = new Date()
): Promise<string> {
  const timestamp = Math.floor(now.getTime() / 1000)
  const signature = await hmacHex(secret, `${timestamp}.${payload}`)

  return `t=${timestamp},v1=${signature}`
}
