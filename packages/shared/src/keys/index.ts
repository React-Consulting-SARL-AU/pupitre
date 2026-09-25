import { z } from "zod"
import { InstantSchema } from "../platform-api"

export const KEY_APPROVAL_NAMESPACE = "pupitre-key-approval"

// A new first line of the signed message is a new format.
const KEY_APPROVAL_HEADER = "pupitre-key-approval-v1"

// sha512 is what `ssh-keygen -Y sign` uses by default.
export const KEY_APPROVAL_HASHES = ["sha512", "sha256"] as const

// A key removed since cannot come back on a replayed approval.
export const KEY_APPROVAL_MAX_AGE_SECONDS = 7 * 86_400

export const KEY_APPROVAL_FUTURE_SKEW_SECONDS = 300

const KEY_APPROVAL_SIGNATURE_MAX = 2048

// A session opens only through the whole sign-in, second factor included, so its age is that proof's.
export const FRESH_SIGN_IN_SECONDS = 600

// The agent refuses anything else before it becomes a file name or a bucket prefix.
export const SERVER_ID_PATTERN =
  "^(?:c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"

const USER_ID_PATTERN = "^[A-Za-z0-9_-]{1,64}$"

export const APPROVED_KEY_TYPES = [
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
] as const

export const APPROVED_KEY_PATTERN =
  "^(?:ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)) [A-Za-z0-9+/]+={0,2}$"

const APPROVED_KEY_MAX = 512

export const KEY_FINGERPRINT_PATTERN = "^SHA256:[A-Za-z0-9+/]{43}$"

// One spelling for one instant.
const ISSUED_AT_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$"

const SIGNATURE_PATTERN =
  "^-----BEGIN SSH SIGNATURE-----\\n(?:[A-Za-z0-9+/=]{1,76}\\n)+-----END SSH SIGNATURE-----\\n?$"

export const ServerIdSchema = z.string().regex(new RegExp(SERVER_ID_PATTERN))

export const ApprovedKeySchema = z
  .string()
  .max(APPROVED_KEY_MAX)
  .regex(new RegExp(APPROVED_KEY_PATTERN))

export const KeyFingerprintSchema = z
  .string()
  .regex(new RegExp(KEY_FINGERPRINT_PATTERN))

export const KeyApprovalSchema = z.strictObject({
  server_id: ServerIdSchema,
  public_key: ApprovedKeySchema,
  user_id: z.string().regex(new RegExp(USER_ID_PATTERN)),
  issued_at: z.string().regex(new RegExp(ISSUED_AT_PATTERN)),
  signer: KeyFingerprintSchema,
  signature: z
    .string()
    .max(KEY_APPROVAL_SIGNATURE_MAX)
    .regex(new RegExp(SIGNATURE_PATTERN)),
})

export type KeyApproval = z.infer<typeof KeyApprovalSchema>

export type KeyApprovalFields = Omit<KeyApproval, "signer" | "signature">

// The exact bytes signed: nothing is trimmed, escaped or reordered on either side.
export function keyApprovalMessage(fields: KeyApprovalFields): string {
  return [
    KEY_APPROVAL_HEADER,
    `server_id:${fields.server_id}`,
    `public_key:${fields.public_key}`,
    `user_id:${fields.user_id}`,
    `issued_at:${fields.issued_at}`,
    "",
  ].join("\n")
}

// The milliseconds are dropped, never rounded up.
export function issuedAtOf(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`
}

export const AgentStateKeySchema = z.object({
  public_key: ApprovedKeySchema,
  user_id: z.string(),
  device_id: z.string(),
  approvals: z.array(KeyApprovalSchema),
})

export type AgentStateKey = z.infer<typeof AgentStateKeySchema>

// Fingerprints only: the platform already holds the public keys.
export const KeysBeatSchema = z.object({
  signers: z.array(KeyFingerprintSchema).max(100),
  pending: z.array(KeyFingerprintSchema).max(100),
})

export type KeysBeat = z.infer<typeof KeysBeatSchema>

export const PendingKeyApprovalSchema = z.object({
  server: z.object({ id: z.string(), name: z.string() }),
  device: z.object({
    id: z.string(),
    name: z.string(),
    fingerprint: KeyFingerprintSchema,
    public_key: ApprovedKeySchema,
  }),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  // The caller's devices that server trusts: another device can sign, but the agent would not take it.
  signers: z.array(KeyFingerprintSchema),
  reported_at: InstantSchema,
})

export type PendingKeyApproval = z.infer<typeof PendingKeyApprovalSchema>

export const KeyApprovalSubmissionSchema = KeyApprovalSchema.extend({
  device_id: z.string().min(1),
})

export type KeyApprovalSubmission = z.infer<typeof KeyApprovalSubmissionSchema>

const ARMOR_BEGIN = "-----BEGIN SSH SIGNATURE-----"
const ARMOR_END = "-----END SSH SIGNATURE-----"
const SSHSIG_MAGIC = "SSHSIG"
const SSHSIG_VERSION = 1
const WHITESPACE_RE = /\s/g
const BLANKS_RE = /\s+/
const PADDING_RE = /=+$/

interface SshSignatureEnvelope {
  publicKey: Uint8Array
  namespace: string
  hashAlgorithm: string
  signatureType: string
}

class Reader {
  private offset = 0
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  uint32(): number {
    if (this.offset + 4 > this.bytes.length) {
      throw new Error("truncated")
    }

    const view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offset,
      4
    )

    this.offset += 4

    return view.getUint32(0)
  }

  string(): Uint8Array {
    const length = this.uint32()

    if (this.offset + length > this.bytes.length) {
      throw new Error("truncated")
    }

    const value = this.bytes.subarray(this.offset, this.offset + length)

    this.offset += length

    return value
  }

  text(): string {
    return new TextDecoder().decode(this.string())
  }

  done(): boolean {
    return this.offset === this.bytes.length
  }
}

function base64Bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

// Read for its shape, not its truth: the agent alone decides what verifies.
export function readSshSignature(armored: string): SshSignatureEnvelope | null {
  const text = armored.trim()

  if (!(text.startsWith(ARMOR_BEGIN) && text.endsWith(ARMOR_END))) {
    return null
  }

  try {
    const body = text
      .slice(ARMOR_BEGIN.length, -ARMOR_END.length)
      .replaceAll(WHITESPACE_RE, "")
    const blob = base64Bytes(body)
    const magic = new TextDecoder().decode(blob.subarray(0, 6))

    if (magic !== SSHSIG_MAGIC) {
      return null
    }

    const reader = new Reader(blob.subarray(6))

    if (reader.uint32() !== SSHSIG_VERSION) {
      return null
    }

    const publicKey = reader.string()
    const namespace = reader.text()

    reader.string()

    const hashAlgorithm = reader.text()
    const signature = new Reader(reader.string())
    const signatureType = signature.text()

    signature.string()

    if (!(reader.done() && signature.done())) {
      return null
    }

    return { publicKey, namespace, hashAlgorithm, signatureType }
  } catch {
    return null
  }
}

function base64Unpadded(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(PADDING_RE, "")
}

export async function keyBlobFingerprint(blob: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(blob))

  return `SHA256:${base64Unpadded(new Uint8Array(digest))}`
}

export async function publicKeyFingerprint(
  line: string
): Promise<string | null> {
  const body = line.trim().split(BLANKS_RE)[1]

  if (!body) {
    return null
  }

  try {
    return await keyBlobFingerprint(base64Bytes(body))
  } catch {
    return null
  }
}
