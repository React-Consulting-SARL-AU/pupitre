import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  type KeyObject,
  pbkdf2,
  randomBytes,
} from "node:crypto"
import { promisify } from "node:util"
import { BACKUP_CONTAINER, BACKUP_KDF } from "./index"

/**
 * The reference implementation of the backup key and container, for Node.
 *
 * The laptop derives the identity from the passphrase here; the agent does the
 * same in Go, and both are held to `fixtures.json`. Nothing on the web side
 * imports this file.
 */

const derive = promisify(pbkdf2)

const PKCS8_X25519 = Buffer.from("302e020100300506032b656e04220420", "hex")

const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex")

const KEY_BYTES = 32

const NONCE_PREFIX_BYTES = 8

const FINAL = Buffer.from([1])

const NOT_FINAL = Buffer.from([0])

export interface BackupIdentity {
  /** The 32-byte X25519 scalar. It leaves the laptop only on the secret line of a restore. */
  privateKey: Buffer
  /** The public half, standard base64: what the server encrypts to. */
  recipient: string
}

export class BackupOpenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackupOpenError"
  }
}

export function normalizePassphrase(passphrase: string): string {
  return passphrase.trim().normalize("NFC")
}

export function drawBackupSalt(): string {
  return randomBytes(BACKUP_KDF.saltBytes).toString("base64")
}

function privateKeyObject(privateKey: Buffer): KeyObject {
  return createPrivateKey({
    key: Buffer.concat([PKCS8_X25519, privateKey]),
    format: "der",
    type: "pkcs8",
  })
}

function publicKeyObject(publicKey: Buffer): KeyObject {
  return createPublicKey({
    key: Buffer.concat([SPKI_X25519, publicKey]),
    format: "der",
    type: "spki",
  })
}

export function recipientOf(privateKey: Buffer): string {
  const spki = createPublicKey(privateKeyObject(privateKey)).export({
    format: "der",
    type: "spki",
  })

  return spki.subarray(SPKI_X25519.length).toString("base64")
}

export async function deriveBackupIdentity(
  passphrase: string,
  salt: string,
  iterations: number = BACKUP_KDF.iterations
): Promise<BackupIdentity> {
  const privateKey = await derive(
    Buffer.from(normalizePassphrase(passphrase), "utf8"),
    Buffer.from(salt, "base64"),
    iterations,
    BACKUP_KDF.keyBytes,
    "sha256"
  )

  return { privateKey, recipient: recipientOf(privateKey) }
}

function sharedSecret(privateKey: Buffer, publicKey: Buffer): Buffer {
  return diffieHellman({
    privateKey: privateKeyObject(privateKey),
    publicKey: publicKeyObject(publicKey),
  })
}

function chunkKey(shared: Buffer, header: Buffer): Buffer {
  return Buffer.from(
    hkdfSync("sha256", shared, header, BACKUP_CONTAINER.info, KEY_BYTES)
  )
}

function nonceOf(prefix: Buffer, counter: number): Buffer {
  const nonce = Buffer.alloc(NONCE_PREFIX_BYTES + 4)

  prefix.copy(nonce, 0)
  nonce.writeUInt32BE(counter, NONCE_PREFIX_BYTES)

  return nonce
}

export interface SealOptions {
  ephemeralPrivateKey?: Buffer
  noncePrefix?: Buffer
  chunkBytes?: number
}

export function sealBackup(
  plaintext: Uint8Array,
  recipient: string,
  options: SealOptions = {}
): Buffer {
  const ephemeral = options.ephemeralPrivateKey ?? randomBytes(KEY_BYTES)
  const prefix = options.noncePrefix ?? randomBytes(NONCE_PREFIX_BYTES)
  const chunkBytes = options.chunkBytes ?? BACKUP_CONTAINER.chunkBytes

  const header = Buffer.alloc(BACKUP_CONTAINER.headerBytes)
  header.write(BACKUP_CONTAINER.magic, 0, "latin1")
  Buffer.from(recipientOf(ephemeral), "base64").copy(header, 8)
  prefix.copy(header, 40)
  header.writeUInt32BE(chunkBytes, 48)

  const key = chunkKey(
    sharedSecret(ephemeral, Buffer.from(recipient, "base64")),
    header
  )

  const data = Buffer.from(plaintext)
  const full = Math.floor(data.length / chunkBytes)
  const chunks: Buffer[] = [header]

  for (let counter = 0; counter <= full; counter += 1) {
    const start = counter * chunkBytes
    const final = counter === full
    const end = final ? data.length : start + chunkBytes

    const cipher = createCipheriv("aes-256-gcm", key, nonceOf(prefix, counter))
    cipher.setAAD(final ? FINAL : NOT_FINAL)

    chunks.push(
      cipher.update(data.subarray(start, end)),
      cipher.final(),
      cipher.getAuthTag()
    )
  }

  return Buffer.concat(chunks)
}

function readHeader(container: Buffer): {
  header: Buffer
  ephemeral: Buffer
  prefix: Buffer
  chunkBytes: number
} {
  if (container.length < BACKUP_CONTAINER.headerBytes) {
    throw new BackupOpenError("the file is shorter than a backup header")
  }

  const header = container.subarray(0, BACKUP_CONTAINER.headerBytes)

  if (header.subarray(0, 8).toString("latin1") !== BACKUP_CONTAINER.magic) {
    throw new BackupOpenError("the file is not a Pupitre backup")
  }

  const chunkBytes = header.readUInt32BE(48)

  if (
    chunkBytes < BACKUP_CONTAINER.minChunkBytes ||
    chunkBytes > BACKUP_CONTAINER.maxChunkBytes
  ) {
    throw new BackupOpenError("the chunk size is out of bounds")
  }

  return {
    header,
    ephemeral: header.subarray(8, 40),
    prefix: header.subarray(40, 48),
    chunkBytes,
  }
}

export function openBackup(container: Uint8Array, privateKey: Buffer): Buffer {
  const bytes = Buffer.from(container)
  const { header, ephemeral, prefix, chunkBytes } = readHeader(bytes)
  const key = chunkKey(sharedSecret(privateKey, ephemeral), header)
  const sealed = chunkBytes + BACKUP_CONTAINER.tagBytes
  const parts: Buffer[] = []

  let offset: number = BACKUP_CONTAINER.headerBytes
  let counter = 0

  while (offset < bytes.length) {
    const end = Math.min(offset + sealed, bytes.length)
    const final = end === bytes.length
    const chunk = bytes.subarray(offset, end)

    if (chunk.length < BACKUP_CONTAINER.tagBytes) {
      throw new BackupOpenError("a chunk is shorter than its tag")
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      nonceOf(prefix, counter)
    )
    decipher.setAAD(final ? FINAL : NOT_FINAL)
    decipher.setAuthTag(
      chunk.subarray(chunk.length - BACKUP_CONTAINER.tagBytes)
    )

    try {
      parts.push(
        decipher.update(
          chunk.subarray(0, chunk.length - BACKUP_CONTAINER.tagBytes)
        ),
        decipher.final()
      )
    } catch {
      throw new BackupOpenError(
        "a chunk does not open: wrong key, or the file was altered or cut"
      )
    }

    counter += 1
    offset = end
  }

  if (counter === 0) {
    throw new BackupOpenError("the file ends after its header")
  }

  return Buffer.concat(parts)
}
