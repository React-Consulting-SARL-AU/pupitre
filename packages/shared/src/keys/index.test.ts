import { describe, expect, it } from "bun:test"
import fixtures from "./fixtures.json"
import {
  AgentStateKeySchema,
  ApprovedKeySchema,
  issuedAtOf,
  KEY_APPROVAL_NAMESPACE,
  KeyApprovalSchema,
  KeysBeatSchema,
  keyApprovalMessage,
  publicKeyFingerprint,
  readSshSignature,
  ServerIdSchema,
} from "./index"

const approval = fixtures.approvals.ed25519

describe("the signed message", () => {
  it("is five LF-ended lines in a fixed order, byte for byte what ssh-keygen signed", () => {
    expect(keyApprovalMessage(approval)).toBe(fixtures.message)
  })

  it("dates an instant to the second in UTC", () => {
    expect(issuedAtOf(new Date("2026-09-25T10:00:00.999Z"))).toBe(
      "2026-09-25T10:00:00Z"
    )
  })
})

describe("an approval", () => {
  it("accepts what the fixtures signed", () => {
    for (const signed of Object.values(fixtures.approvals)) {
      expect(KeyApprovalSchema.safeParse(signed).success).toBe(true)
    }
  })

  it("refuses a key with options, a comment or a refused type", () => {
    for (const key of [
      `no-pty ${approval.public_key}`,
      `${approval.public_key} jordan@laptop`,
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ",
      "ssh-dss AAAAB3NzaC1kc3MAAACBAP",
      `${approval.public_key}\nssh-ed25519 AAAA`,
    ]) {
      expect(ApprovedKeySchema.safeParse(key).success).toBe(false)
    }
  })

  it("refuses a server identifier that is neither a cuid nor a UUID", () => {
    expect(ServerIdSchema.safeParse(approval.server_id).success).toBe(true)
    expect(
      ServerIdSchema.safeParse("0f8b1c52-4a0e-4c6f-9b1e-3d2a7c9e5f10").success
    ).toBe(true)

    for (const id of ["srv_42", "../etc", "", "CM0K2X9Q80000A1B2C3D4E5F6"]) {
      expect(ServerIdSchema.safeParse(id).success).toBe(false)
    }
  })

  it("refuses a date that is not UTC to the second, and unknown fields", () => {
    expect(
      KeyApprovalSchema.safeParse({
        ...approval,
        issued_at: "2026-09-25T10:00:00.000Z",
      }).success
    ).toBe(false)
    expect(
      KeyApprovalSchema.safeParse({ ...approval, extra: true }).success
    ).toBe(false)
  })
})

describe("the SSHSIG envelope", () => {
  it("names its namespace, hash and the signer's key", async () => {
    const envelope = readSshSignature(approval.signature)

    expect(envelope?.namespace).toBe(KEY_APPROVAL_NAMESPACE)
    expect(envelope?.hashAlgorithm).toBe("sha512")
    expect(envelope?.signatureType).toBe("ssh-ed25519")
    expect(
      envelope &&
        (await publicKeyFingerprint(`x ${btoaOf(envelope.publicKey)}`))
    ).toBe(approval.signer)
  })

  it("reads the ECDSA and sha256 variants, and says which namespace a stray one carries", () => {
    expect(
      readSshSignature(fixtures.approvals.ecdsa.signature)?.signatureType
    ).toBe("ecdsa-sha2-nistp256")
    expect(
      readSshSignature(fixtures.approvals.ed25519_sha256.signature)
        ?.hashAlgorithm
    ).toBe("sha256")
    expect(
      readSshSignature(fixtures.approvals.wrong_namespace.signature)?.namespace
    ).toBe("file")
  })

  it("refuses what is not an envelope", () => {
    expect(readSshSignature("")).toBeNull()
    expect(
      readSshSignature(
        "-----BEGIN SSH SIGNATURE-----\nAAAA\n-----END SSH SIGNATURE-----\n"
      )
    ).toBeNull()
    expect(
      readSshSignature(approval.signature.replace("U1NIU0lH", "U1NIU0lI"))
    ).toBeNull()
  })

  it("fingerprints a key the way ssh-keygen does", async () => {
    expect(await publicKeyFingerprint(fixtures.signers.ed25519)).toBe(
      approval.signer
    )
    expect(await publicKeyFingerprint(fixtures.signers.ecdsa)).toBe(
      fixtures.approvals.ecdsa.signer
    )
    expect(await publicKeyFingerprint("ssh-ed25519")).toBeNull()
  })
})

describe("what travels with the state and the heartbeat", () => {
  it("carries each key with its approvals", () => {
    expect(
      AgentStateKeySchema.safeParse({
        public_key: approval.public_key,
        user_id: approval.user_id,
        device_id: "dev_1",
        approvals: [approval],
      }).success
    ).toBe(true)
  })

  it("reports fingerprints only", () => {
    expect(
      KeysBeatSchema.safeParse({ signers: [approval.signer], pending: [] })
        .success
    ).toBe(true)
    expect(
      KeysBeatSchema.safeParse({ signers: [approval.public_key], pending: [] })
        .success
    ).toBe(false)
  })
})

function btoaOf(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}
