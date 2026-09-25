import { z } from "zod"

/**
 * A key reaches a server's managed block only with an approval signed by a key
 * the agent already trusts (decision 0014). These are the shapes and the exact
 * bytes the three sides agree on: the app signs them, the platform relays them,
 * the agent verifies them.
 */

/** The SSHSIG namespace every approval is signed under: `ssh-keygen -Y sign -n pupitre-key-approval`. */
export const KEY_APPROVAL_NAMESPACE = "pupitre-key-approval"

/** The first line of the signed message; a new line of it is a new format. */
export const KEY_APPROVAL_HEADER = "pupitre-key-approval-v1"

/** The hash `ssh-keygen -Y sign` uses by default, and the only one the agent accepts besides sha256. */
export const KEY_APPROVAL_HASHES = ["sha512", "sha256"] as const

/** An approval older than this is refused: a key removed since cannot come back on a replayed one. */
export const KEY_APPROVAL_MAX_AGE_SECONDS = 7 * 86_400

/** How far ahead of the agent's clock an approval may be dated. */
export const KEY_APPROVAL_FUTURE_SKEW_SECONDS = 300

export const KEY_APPROVAL_SIGNATURE_MAX = 2048

/**
 * How recent a sign-in must be to add a device to an account, or to approve a
 * device code: a session opens only through the whole sign-in, passkey or
 * second factor included, so its age is the age of that proof.
 */
export const FRESH_SIGN_IN_SECONDS = 600

/**
 * A platform identifier for a server: the cuid Prisma draws today, or a UUID.
 * The agent refuses anything else before it becomes a file name or a bucket prefix.
 */
export const SERVER_ID_PATTERN =
  "^(?:c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"

export const USER_ID_PATTERN = "^[A-Za-z0-9_-]{1,64}$"

/**
 * The key an approval admits, as `type base64` and nothing else: no options,
 * no comment. Ed25519, or ECDSA on a NIST curve; RSA and DSA are refused.
 */
export const APPROVED_KEY_TYPES = [
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
] as const

export const APPROVED_KEY_PATTERN =
  "^(?:ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)) [A-Za-z0-9+/]+={0,2}$"

export const APPROVED_KEY_MAX = 512

/** OpenSSH's own fingerprint: `SHA256:` and 43 characters of unpadded base64. */
export const KEY_FINGERPRINT_PATTERN = "^SHA256:[A-Za-z0-9+/]{43}$"

/** UTC, to the second, with a `Z`: one spelling for one instant. */
export const ISSUED_AT_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$"

export const SIGNATURE_PATTERN =
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

/**
 * The exact bytes signed: five lines, each ended by a single LF, in this order,
 * ASCII only since every field is held to its pattern. The key is `type base64`
 * without a comment, the date is `issued_at` as sent. Nothing is trimmed,
 * escaped or reordered on either side.
 */
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

/** `issued_at` for an instant: the milliseconds dropped, never rounded up. */
export function issuedAtOf(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`
}

/** One key the platform wants on a server, with every approval it holds for it. */
export const AgentStateKeySchema = z.object({
  public_key: ApprovedKeySchema,
  user_id: z.string(),
  device_id: z.string(),
  approvals: z.array(KeyApprovalSchema),
})

export type AgentStateKey = z.infer<typeof AgentStateKeySchema>

/**
 * What the heartbeat says of the keys: the fingerprints the agent trusts to
 * sign, and the ones the platform asked for that no valid approval covers yet.
 * Fingerprints only — the platform already holds the public keys.
 */
export const KeysBeatSchema = z.object({
  signers: z.array(KeyFingerprintSchema).max(100),
  pending: z.array(KeyFingerprintSchema).max(100),
})

export type KeysBeat = z.infer<typeof KeysBeatSchema>

/**
 * `GET /me/key-approvals`: a key a server reported pending, which the caller
 * may approve. `signers` are the caller's own devices that server trusts; a
 * device not among them can sign, but the agent would not take it.
 */
export const PendingKeyApprovalSchema = z.object({
  server: z.object({ id: z.string(), name: z.string() }),
  device: z.object({
    id: z.string(),
    name: z.string(),
    fingerprint: KeyFingerprintSchema,
    public_key: ApprovedKeySchema,
  }),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  signers: z.array(KeyFingerprintSchema),
  reported_at: z.string(),
})

export type PendingKeyApproval = z.infer<typeof PendingKeyApprovalSchema>

/** `POST /me/key-approvals`: the signed approval, and the device it admits. */
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

export interface SshSignatureEnvelope {
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

/**
 * The SSHSIG envelope read for its shape, not its truth: the platform uses it
 * to refuse what is malformed, the agent alone decides what verifies.
 */
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

/** OpenSSH's `SHA256:` fingerprint of a key's wire blob. */
export async function keyBlobFingerprint(blob: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(blob))

  return `SHA256:${base64Unpadded(new Uint8Array(digest))}`
}

/** The same fingerprint, from a `type base64 [comment]` line; null when it is not one. */
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
