// biome-ignore-all lint/suspicious/noBitwiseOperators: CBOR, COSE and DER are byte formats; bit masks are the notation.

const CREDENTIAL_ID_BYTES = 32
const AAGUID_BYTES = 16
const SIGN_COUNT_BYTES = 4
const COMPONENT_BYTES = 32

const USER_PRESENT = 0x01
const USER_VERIFIED = 0x04
const BACKUP_ELIGIBLE = 0x08
const BACKUP_STATE = 0x10
const ATTESTED_CREDENTIAL_DATA = 0x40

const REGISTRATION_FLAGS =
  USER_PRESENT |
  USER_VERIFIED |
  BACKUP_ELIGIBLE |
  BACKUP_STATE |
  ATTESTED_CREDENTIAL_DATA
const AUTHENTICATION_FLAGS =
  USER_PRESENT | USER_VERIFIED | BACKUP_ELIGIBLE | BACKUP_STATE

const encoder = new TextEncoder()

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0

  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }

  return out
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))

  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  )
}

function cborHead(major: number, length: number): Uint8Array {
  if (length < 24) {
    return Uint8Array.of((major << 5) | length)
  }

  if (length < 0x1_00) {
    return Uint8Array.of((major << 5) | 24, length)
  }

  return Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff)
}

function cborBytes(value: Uint8Array): Uint8Array {
  return concat(cborHead(2, value.length), value)
}

function cborText(value: string): Uint8Array {
  const bytes = encoder.encode(value)

  return concat(cborHead(3, bytes.length), bytes)
}

// COSE_Key for ES256: kty EC2, alg -7, crv P-256, then x and y.
function coseKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  return concat(
    Uint8Array.of(0xa5),
    Uint8Array.of(0x01, 0x02),
    Uint8Array.of(0x03, 0x26),
    Uint8Array.of(0x20, 0x01),
    Uint8Array.of(0x21),
    cborBytes(x),
    Uint8Array.of(0x22),
    cborBytes(y)
  )
}

function attestationObject(authData: Uint8Array): Uint8Array {
  return concat(
    Uint8Array.of(0xa3),
    cborText("fmt"),
    cborText("none"),
    cborText("attStmt"),
    Uint8Array.of(0xa0),
    cborText("authData"),
    cborBytes(authData)
  )
}

function derInteger(component: Uint8Array): Uint8Array {
  let start = 0

  while (start < component.length - 1 && component[start] === 0) {
    start += 1
  }

  const trimmed = component.subarray(start)
  const body =
    (trimmed[0] & 0x80) === 0 ? trimmed : concat(Uint8Array.of(0), trimmed)

  return concat(Uint8Array.of(0x02, body.length), body)
}

// WebAuthn carries ECDSA signatures in ASN.1 DER; WebCrypto emits raw r‖s.
function derSignature(raw: Uint8Array): Uint8Array {
  const body = concat(
    derInteger(raw.subarray(0, COMPONENT_BYTES)),
    derInteger(raw.subarray(COMPONENT_BYTES))
  )

  return concat(Uint8Array.of(0x30, body.length), body)
}

function clientData(
  type: string,
  challenge: string,
  origin: string
): Uint8Array {
  return encoder.encode(
    JSON.stringify({ type, challenge, origin, crossOrigin: false })
  )
}

async function authenticatorData(
  rpId: string,
  flags: number,
  signCount: number,
  attested?: Uint8Array
): Promise<Uint8Array> {
  const counter = new Uint8Array(SIGN_COUNT_BYTES)

  new DataView(counter.buffer).setUint32(0, signCount, false)

  const head = concat(
    await sha256(encoder.encode(rpId)),
    Uint8Array.of(flags),
    counter
  )

  return attested ? concat(head, attested) : head
}

export interface RegistrationResponse {
  id: string
  rawId: string
  type: "public-key"
  authenticatorAttachment: "platform"
  clientExtensionResults: Record<string, never>
  response: {
    clientDataJSON: string
    attestationObject: string
    transports: string[]
  }
}

export interface AuthenticationResponse {
  id: string
  rawId: string
  type: "public-key"
  authenticatorAttachment: "platform"
  clientExtensionResults: Record<string, never>
  response: {
    clientDataJSON: string
    authenticatorData: string
    signature: string
    userHandle: string | null
  }
}

interface StoredCredential {
  id: Uint8Array
  keyPair: CryptoKeyPair
  userHandle: string | null
  signCount: number
}

export interface VirtualAuthenticatorOptions {
  rpId: string
  origin: string
}

export interface RegistrationOptionsJSON {
  challenge: string
  user?: { id?: string }
}

export interface AuthenticationOptionsJSON {
  challenge: string
}

/** Signs real P-256 ceremonies so passkey routes run end to end: Better Auth ships no simulator. */
export class VirtualAuthenticator {
  private readonly rpId: string
  private readonly origin: string
  private readonly credentials = new Map<string, StoredCredential>()

  constructor({ rpId, origin }: VirtualAuthenticatorOptions) {
    this.rpId = rpId
    this.origin = origin
  }

  async register(
    options: RegistrationOptionsJSON
  ): Promise<RegistrationResponse> {
    const keyPair = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"]
    )) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey)
    const credentialId = crypto.getRandomValues(
      new Uint8Array(CREDENTIAL_ID_BYTES)
    )
    const id = base64url(credentialId)

    this.credentials.set(id, {
      id: credentialId,
      keyPair,
      userHandle: options.user?.id ?? null,
      signCount: 0,
    })

    const credentialIdLength = new Uint8Array(2)

    new DataView(credentialIdLength.buffer).setUint16(
      0,
      credentialId.length,
      false
    )

    const attested = concat(
      new Uint8Array(AAGUID_BYTES),
      credentialIdLength,
      credentialId,
      coseKey(fromBase64url(jwk.x ?? ""), fromBase64url(jwk.y ?? ""))
    )
    const authData = await authenticatorData(
      this.rpId,
      REGISTRATION_FLAGS,
      0,
      attested
    )

    return {
      id,
      rawId: id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64url(
          clientData("webauthn.create", options.challenge, this.origin)
        ),
        attestationObject: base64url(attestationObject(authData)),
        transports: ["internal"],
      },
    }
  }

  async authenticate(
    options: AuthenticationOptionsJSON,
    credentialId?: string
  ): Promise<AuthenticationResponse> {
    const id = credentialId ?? [...this.credentials.keys()].at(-1)
    const credential = id ? this.credentials.get(id) : undefined

    if (!(id && credential)) {
      throw new Error("no credential registered on this authenticator")
    }

    credential.signCount += 1

    const authData = await authenticatorData(
      this.rpId,
      AUTHENTICATION_FLAGS,
      credential.signCount
    )
    const clientDataJSON = clientData(
      "webauthn.get",
      options.challenge,
      this.origin
    )
    const signed = concat(authData, await sha256(clientDataJSON))
    const raw = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        credential.keyPair.privateKey,
        new Uint8Array(signed)
      )
    )

    return {
      id,
      rawId: id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64url(clientDataJSON),
        authenticatorData: base64url(authData),
        signature: base64url(derSignature(raw)),
        userHandle: credential.userHandle,
      },
    }
  }
}
