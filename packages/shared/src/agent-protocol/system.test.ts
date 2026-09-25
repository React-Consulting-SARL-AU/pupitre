import { describe, expect, it } from "bun:test"
import {
  AgentUpgradeParamsSchema,
  AgentUpgradeResultSchema,
  DiagResultSchema,
  DoctorResultSchema,
  DoneResultSchema,
  EnrollParamsSchema,
  EnrollResultSchema,
  EnrollSecretsSchema,
  KeysListResultSchema,
  KeysTrustParamsSchema,
} from "./system"

describe("keys", () => {
  it("list the fingerprints of the managed block", () => {
    expect(
      KeysListResultSchema.safeParse({
        keys: [
          {
            fingerprint: "SHA256:abc",
            comment: "jordan@macbook",
            device_id: "dev_01H",
          },
        ],
        synced_at: "2026-09-04T10:00:00Z",
      }).success
    ).toBe(true)
    expect(
      KeysListResultSchema.safeParse({ keys: [{ comment: "x" }] }).success
    ).toBe(false)
  })

  it("say which keys sign and which wait for an approval", () => {
    expect(
      KeysListResultSchema.safeParse({
        keys: [{ fingerprint: "SHA256:abc", signer: true }],
        pending: ["SHA256:bfE4sIISeLP0EoiJhWxcXY6eN1yxSvh+02YHKswso0U"],
      }).success
    ).toBe(true)
  })

  it("trust a bare key and refuse one with options or of a refused type", () => {
    const key =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIIpnKVP1oHEgOAeBppA7YR+8vwKg5ylIyTLxWKT7IaS"

    expect(KeysTrustParamsSchema.safeParse({ public_key: key }).success).toBe(
      true
    )

    for (const public_key of [
      `command="sh" ${key}`,
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ",
    ]) {
      expect(KeysTrustParamsSchema.safeParse({ public_key }).success).toBe(
        false
      )
    }
  })
})

describe("agent.upgrade", () => {
  it("takes a version alone: the fingerprint comes from the platform", () => {
    expect(
      AgentUpgradeParamsSchema.safeParse({
        version: "0.4.0",
        signature: "base64…",
      }).success
    ).toBe(true)
    expect(
      AgentUpgradeParamsSchema.safeParse({ version: "0.4.0" }).success
    ).toBe(true)
    expect(AgentUpgradeParamsSchema.safeParse({}).success).toBe(true)
  })

  it("carries the owner's explicit downgrade", () => {
    expect(
      AgentUpgradeParamsSchema.safeParse({
        version: "0.3.1",
        allow_downgrade: true,
      }).success
    ).toBe(true)
    expect(
      AgentUpgradeParamsSchema.safeParse({
        version: "0.3.1",
        allow_downgrade: "oui",
      }).success
    ).toBe(false)
  })

  it("reports both versions", () => {
    expect(
      AgentUpgradeResultSchema.safeParse({
        previous_version: "0.3.1",
        version: "0.4.0",
        restarting: true,
      }).success
    ).toBe(true)
    expect(
      AgentUpgradeResultSchema.safeParse({ version: "0.4.0" }).success
    ).toBe(false)
  })
})

describe("doctor, diag, done", () => {
  it("accept their examples", () => {
    expect(
      DoctorResultSchema.safeParse({
        checks: [
          { name: "ssh", ok: true },
          {
            name: "tunnel",
            ok: false,
            message: "down",
            fix: "dev tunnel restart",
          },
        ],
      }).success
    ).toBe(true)
    expect(
      DiagResultSchema.safeParse({
        generated_at: "2026-09-04T10:00:00Z",
        report: "pupitred 0.3.1\n…",
      }).success
    ).toBe(true)
    expect(DoneResultSchema.safeParse({ done: true }).success).toBe(true)
  })

  it("reject a check without verdict and a done that is not true", () => {
    expect(
      DoctorResultSchema.safeParse({ checks: [{ name: "ssh" }] }).success
    ).toBe(false)
    expect(DoneResultSchema.safeParse({ done: false }).success).toBe(false)
  })
})

describe("enroll", () => {
  it("names the platform in params and never the token", () => {
    expect(
      EnrollParamsSchema.safeParse({
        platform_url: "https://app.pupitre.studio/api/v1",
        secrets_stdin: true,
      }).success
    ).toBe(true)
    expect(
      EnrollParamsSchema.safeParse({
        platform_url: "https://app.pupitre.studio/api/v1",
        secrets_stdin: true,
        enrollment_token: "enr_secret",
      }).success
    ).toBe(false)
    expect(
      EnrollParamsSchema.safeParse({
        platform_url: "https://app.pupitre.studio/api/v1",
      }).success
    ).toBe(false)
    expect(
      EnrollParamsSchema.safeParse({
        platform_url: "app.pupitre.studio",
        secrets_stdin: true,
      }).success
    ).toBe(false)
  })

  it("carries the token alone on the secret line", () => {
    expect(
      EnrollSecretsSchema.safeParse({ enrollment_token: "enr_secret" }).success
    ).toBe(true)
    expect(
      EnrollSecretsSchema.safeParse({ enrollment_token: "" }).success
    ).toBe(false)
    expect(
      EnrollSecretsSchema.safeParse({
        enrollment_token: "enr_secret",
        platform_url: "https://app.pupitre.studio/api/v1",
      }).success
    ).toBe(false)
  })

  it("answers with the entitlement the platform granted", () => {
    expect(
      EnrollResultSchema.safeParse({
        enrolled: true,
        entitlement: "valid",
        synced_at: "2026-09-05T10:00:00Z",
      }).success
    ).toBe(true)
    expect(
      EnrollResultSchema.safeParse({ enrolled: true, entitlement: "valid" })
        .success
    ).toBe(true)
    expect(
      EnrollResultSchema.safeParse({ enrolled: false, entitlement: "valid" })
        .success
    ).toBe(false)
  })
})
