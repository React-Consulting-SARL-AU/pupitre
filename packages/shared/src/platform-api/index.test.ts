import { describe, expect, it } from "bun:test"
import { contractJsonSchema } from "../contracts/json-schema"
import { isLiveSubscriptionStatus } from "../plans"
import {
  KeyApprovalReceiptSchema,
  LatestAgentReleaseSchema,
  listOf,
  MeSchema,
  ServerEnrollmentSchema,
  ServerForUserSchema,
} from "./account"
import { AgentExchangeSchema, AgentStateSchema, HeartbeatSchema } from "./agent"
import {
  AccountEntitlementSchema,
  InstantSchema,
  isEntitled,
  ServerEntitlementSchema,
} from "./index"

const KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINIqIikYhGRpaqoJuvKifjn/NLVieWICV3MrBVyZO2Lj"

function agentState(overrides: Record<string, unknown> = {}) {
  return {
    entitlement: "valid",
    valid_until: "2026-09-26T00:00:00.000Z",
    authorized_keys: [KEY],
    keys: [{ public_key: KEY, user_id: "u1", device_id: "d1", approvals: [] }],
    target_version: "1.4.0",
    minimum_version: null,
    hostname: "vps",
    server_id: "cm0k2x9q80000a1b2c3d4e5f6",
    ...overrides,
  }
}

function me(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "u1",
      email: "jordan@example.org",
      name: "Jordan",
      image: null,
      locale: "fr",
      created_at: "2026-09-01T10:00:00.000Z",
    },
    organizations: [
      { id: "o1", name: "Acme", slug: "acme", state: "active", role: "owner" },
    ],
    active_organization: {
      id: "o1",
      name: "Acme",
      slug: "acme",
      state: "active",
      reason: null,
    },
    role: "owner",
    platform_role: null,
    entitlement: "valid",
    subscription: null,
    ...overrides,
  }
}

describe("the entitlements", () => {
  it("grant a server one of three states and tell an account without organization apart", () => {
    expect(ServerEntitlementSchema.options).toEqual([
      "valid",
      "grace",
      "suspended",
    ])
    expect(AccountEntitlementSchema.options).toEqual([
      "none",
      "valid",
      "grace",
      "suspended",
    ])
  })

  it("let grace run like a valid right", () => {
    expect(isEntitled("grace")).toBe(true)
    expect(isEntitled("suspended")).toBe(false)
    expect(isEntitled("none")).toBe(false)
  })
})

describe("InstantSchema", () => {
  it("takes what Date and Go write, with or without an offset, and nothing else", () => {
    for (const instant of [
      "2026-09-05T12:00:00.000Z",
      "2026-09-05T12:00:00Z",
      "2026-09-05T12:00:00.123456789Z",
      "2026-09-05T14:00:00+02:00",
    ]) {
      expect(InstantSchema.safeParse(instant).success, instant).toBe(true)
    }

    for (const instant of ["yesterday", "2026-09-05", "2026-13-05T12:00:00Z"]) {
      expect(InstantSchema.safeParse(instant).success, instant).toBe(false)
    }
  })
})

describe("the agent's side of the platform", () => {
  it("reads the state the platform answers, keys and floor included", () => {
    expect(AgentStateSchema.safeParse(agentState()).success).toBe(true)
    expect(
      AgentStateSchema.safeParse(agentState({ entitlement: "none" })).success
    ).toBe(false)
    expect(
      AgentStateSchema.safeParse(agentState({ valid_until: "demain" })).success
    ).toBe(false)
  })

  it("bounds the heartbeat's lists and keeps its optional fields optional", () => {
    const beat = {
      disk: 41,
      ram: 62,
      load: 0.4,
      sessions: [],
      stack_version: "1.2.3",
      modules: [],
    }

    expect(HeartbeatSchema.safeParse(beat).success).toBe(true)
    expect(
      HeartbeatSchema.safeParse({
        ...beat,
        modules: Array.from({ length: 101 }, () => "m"),
      }).success
    ).toBe(false)
    expect(
      HeartbeatSchema.safeParse({ ...beat, ssh_user: "dev;rm" }).success
    ).toBe(false)
    expect(HeartbeatSchema.safeParse({ ...beat, disk: -1 }).success).toBe(false)
  })

  it("exchanges an enrolment for an architecture of the catalogue only", () => {
    const exchange = {
      enrollment_token: "t",
      host_public_key: "ssh-ed25519 AAAA",
      agent_version: "1.2.3",
      arch: "arm64",
    }

    expect(AgentExchangeSchema.safeParse(exchange).success).toBe(true)
    expect(
      AgentExchangeSchema.safeParse({ ...exchange, arch: "x64" }).success
    ).toBe(false)
  })
})

describe("the app's side of the platform", () => {
  it("reads /me with the states, the platform role and the typed role", () => {
    expect(MeSchema.safeParse(me()).success).toBe(true)
    expect(MeSchema.safeParse(me({ role: "superuser" })).success).toBe(false)
    expect(MeSchema.safeParse(me({ platform_role: "admin" })).success).toBe(
      true
    )
    expect(
      MeSchema.safeParse(
        me({
          organizations: [{ id: "o1", name: "Acme", slug: "acme", role: "x" }],
        })
      ).success
    ).toBe(false)
  })

  it("reads the servers of an account with the platform's statuses", () => {
    const server = {
      id: "s1",
      name: "vps",
      host: "vps.example.org",
      port: 22,
      user: "dev",
      host_fingerprint: null,
      status: "active",
      key_ready: true,
      organization: { id: "o1", name: "Acme" },
    }

    expect(
      listOf(ServerForUserSchema).safeParse({ data: [server] }).success
    ).toBe(true)
    expect(
      ServerForUserSchema.safeParse({ ...server, status: "online" }).success
    ).toBe(false)
  })

  it("reads an enrolment, a release and a receipt", () => {
    expect(
      ServerEnrollmentSchema.safeParse({
        server_id: "s1",
        enrollment_token: "t",
        release: {
          version: "1.4.0",
          url: "https://dl.example.org/a",
          sha256: "a",
          signature: "b",
          channel: "stable",
        },
      }).success
    ).toBe(true)
    expect(
      LatestAgentReleaseSchema.safeParse({
        version: "1.4.0",
        arch: "amd64",
        sha256: "a",
        signature: "b",
      }).success
    ).toBe(true)
    expect(
      KeyApprovalReceiptSchema.safeParse({ server_id: "s1" }).success
    ).toBe(false)
  })
})

describe("contractJsonSchema", () => {
  it("renders a contract as a standalone JSON Schema", () => {
    const schema = contractJsonSchema(ServerForUserSchema)

    expect(schema.$schema).toBeUndefined()
    expect(schema.type).toBe("object")
    expect(schema.required).toContain("status")
  })
})

describe("the live subscription statuses", () => {
  it("are the ones Stripe still bills", () => {
    expect(isLiveSubscriptionStatus("past_due")).toBe(true)
    expect(isLiveSubscriptionStatus("unpaid")).toBe(false)
    expect(isLiveSubscriptionStatus("canceled")).toBe(false)
  })
})
