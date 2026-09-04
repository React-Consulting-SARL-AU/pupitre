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
})

describe("agent.upgrade", () => {
  it("requires a signature", () => {
    expect(
      AgentUpgradeParamsSchema.safeParse({
        version: "0.4.0",
        signature: "base64…",
      }).success
    ).toBe(true)
    expect(
      AgentUpgradeParamsSchema.safeParse({ signature: "base64…" }).success
    ).toBe(true)
    expect(
      AgentUpgradeParamsSchema.safeParse({ version: "0.4.0" }).success
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
