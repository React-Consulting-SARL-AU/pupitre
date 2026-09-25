import { describe, expect, it } from "bun:test"
import {
  BackupBeatSchema,
  BackupDeclarationSchema,
} from "@pupitre/shared/backup"
import type { ContractSchema } from "@pupitre/shared/contracts/json-schema"
import {
  MeSchema,
  ServerForUserSchema,
} from "@pupitre/shared/platform-api/account"
import {
  AgentStateSchema,
  HeartbeatSchema,
} from "@pupitre/shared/platform-api/agent"
import { Value } from "@sinclair/typebox/value"
import { fromContract } from "./contract-schema"

const KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINIqIikYhGRpaqoJuvKifjn/NLVieWICV3MrBVyZO2Lj"

const beat = {
  disk: 41,
  ram: 62,
  load: 0.4,
  sessions: ["web/claude"],
  stack_version: "1.2.3",
  modules: ["core.system"],
}

const declaration = {
  id: "20260924T030000Z-abcdef",
  created_at: "2026-09-24T03:00:00Z",
  trigger: "schedule",
  bytes: 133,
  counts: { setup: true, home: true, databases: 1, projects: 1, paths: 0 },
  config_revision: 3,
  agent_version: "1.2.3",
  recipient: "A".repeat(43).concat("="),
  kdf_salt: "A".repeat(22).concat("=="),
  location: {
    endpoint: "https://s3.example.org",
    region: "auto",
    bucket: "backups",
    key: "pupitre/s1/20260924T030000Z-abcdef",
    path_style: false,
    sha256: "a".repeat(64),
  },
}

const state = {
  entitlement: "valid",
  valid_until: "2026-09-26T00:00:00.000Z",
  authorized_keys: [],
  keys: [{ public_key: KEY, user_id: "u1", device_id: "d1", approvals: [] }],
  target_version: null,
  minimum_version: "1.2.0",
  hostname: "vps",
  server_id: "s1",
}

const me = {
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
  active_organization: null,
  role: null,
  platform_role: null,
  entitlement: "none",
  subscription: {
    status: "trialing",
    trial_ends_at: "2026-10-01T00:00:00.000Z",
    current_period_end: "2026-10-01T00:00:00.000Z",
    servers: { used: 1, limit: 1 },
  },
}

const cases: [string, ContractSchema, unknown[]][] = [
  [
    "Heartbeat",
    HeartbeatSchema,
    [
      beat,
      { ...beat, ssh_user: "dev", backup: { interval_hours: 24 } },
      { ...beat, disk: -1 },
      { ...beat, ssh_user: "dev user" },
      { ...beat, sessions: ["x".repeat(201)] },
      { ...beat, modules: Array.from({ length: 101 }, () => "m") },
      { ...beat, backup: { interval_hours: 24, last_run_at: "hier" } },
      { ...beat, keys: { signers: ["SHA256:nope"], pending: [] } },
      { ...beat, stack_version: undefined },
    ],
  ],
  [
    "BackupBeat",
    BackupBeatSchema,
    [
      { interval_hours: 0 },
      { interval_hours: 721 },
      { interval_hours: 24, last_ok_at: "2026-09-19T03:15:00+02:00" },
      { interval_hours: 24, last_error: "e".repeat(501) },
    ],
  ],
  [
    "BackupDeclaration",
    BackupDeclarationSchema,
    [
      declaration,
      { ...declaration, name: "avant la migration" },
      { ...declaration, name: " espace" },
      { ...declaration, created_at: "2026-09-24" },
      { ...declaration, trigger: "cron" },
      { ...declaration, recipient: "court" },
      {
        ...declaration,
        location: { ...declaration.location, sha256: undefined },
      },
      {
        ...declaration,
        location: { ...declaration.location, endpoint: "http://s3" },
      },
    ],
  ],
  [
    "AgentState",
    AgentStateSchema,
    [
      state,
      { ...state, entitlement: "none" },
      { ...state, keys: [{ ...state.keys[0], public_key: "ssh-rsa AAAA" }] },
      { ...state, valid_until: null },
    ],
  ],
  [
    "Me",
    MeSchema,
    [
      me,
      { ...me, role: "superuser" },
      { ...me, entitlement: "valid", role: "owner", platform_role: "member" },
      { ...me, user: { ...me.user, locale: "de" } },
      {
        ...me,
        subscription: { ...me.subscription, servers: { used: 1.5, limit: 1 } },
      },
    ],
  ],
  [
    "ServerForUser",
    ServerForUserSchema,
    [
      {
        id: "s1",
        name: "vps",
        host: null,
        port: 22,
        user: "dev",
        host_fingerprint: null,
        status: "enrolling",
        key_ready: false,
        organization: { id: "o1", name: "Acme" },
      },
      { id: "s1", status: "online" },
    ],
  ],
]

describe("fromContract", () => {
  for (const [name, contract, values] of cases) {
    it(`accepts and refuses what the ${name} contract does`, () => {
      const converted = fromContract(contract)

      for (const value of values) {
        expect(Value.Check(converted, value), JSON.stringify(value)).toBe(
          contract.safeParse(value).success
        )
      }
    })
  }

  it("names the schema for the OpenAPI document", () => {
    expect(
      fromContract(ServerForUserSchema, { $id: "ServerForUser" }).$id
    ).toBe("ServerForUser")
  })

  it("keeps an optional field optional and a nullable one required", () => {
    const converted = fromContract(MeSchema) as unknown as {
      required: string[]
    }

    expect(converted.required).toContain("active_organization")
    expect(
      (fromContract(HeartbeatSchema) as unknown as { required: string[] })
        .required
    ).not.toContain("ssh_user")
  })
})
