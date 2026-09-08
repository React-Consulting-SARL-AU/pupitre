import { describe, expect, it } from "bun:test"
import {
  DbDumpResultSchema,
  DbImportResultSchema,
  DbParamsSchema,
  DbShellResultSchema,
  DbUrlResultSchema,
  SecretEventSchema,
  SecretsSetParamsSchema,
  SecretsStatusResultSchema,
  SecretsSyncParamsSchema,
  ServiceSecretParamsSchema,
  ServiceSecretResultSchema,
  TunnelStatusResultSchema,
} from "./secrets"

describe("secrets", () => {
  it("list keys without values", () => {
    expect(
      SecretsStatusResultSchema.safeParse({
        secrets: [
          { key: "GITHUB_TOKEN", set: true },
          { key: "OP_SERVICE_ACCOUNT_TOKEN", set: false },
        ],
      }).success
    ).toBe(true)
    expect(
      SecretsStatusResultSchema.safeParse({
        secrets: [{ key: "GITHUB_TOKEN", set: true, value: "ghp_x" }],
      }).success
    ).toBe(false)
  })

  it("set announces the secret stream and never carries the value", () => {
    expect(
      SecretsSetParamsSchema.safeParse({
        key: "GITHUB_TOKEN",
        secrets_stdin: true,
      }).success
    ).toBe(true)
    expect(
      SecretsSetParamsSchema.safeParse({ key: "GITHUB_TOKEN", value: "ghp_x" })
        .success
    ).toBe(false)
    expect(
      SecretsSyncParamsSchema.safeParse({ project: "flymate-api" }).success
    ).toBe(true)
  })

  it("reveal names a module and one of its keys, never a value", () => {
    expect(
      ServiceSecretParamsSchema.safeParse({
        id: "db.mysql",
        key: "MYSQL_APP_PASSWORD",
      }).success
    ).toBe(true)
    expect(
      ServiceSecretParamsSchema.safeParse({
        id: "db.mysql",
        key: "MYSQL_APP_PASSWORD",
        value: "hunter2",
      }).success
    ).toBe(false)
    expect(
      ServiceSecretParamsSchema.safeParse({ key: "MYSQL_APP_PASSWORD" }).success
    ).toBe(false)
  })

  it("the ack carries the key alone and the value rides a secret event", () => {
    expect(
      ServiceSecretResultSchema.safeParse({ key: "MYSQL_APP_PASSWORD" }).success
    ).toBe(true)

    expect(
      SecretEventSchema.safeParse({
        id: 12,
        event: "secret",
        key: "MYSQL_APP_PASSWORD",
        value: "hunter2",
      }).success
    ).toBe(true)
    expect(
      SecretEventSchema.safeParse({
        id: 12,
        event: "log",
        key: "MYSQL_APP_PASSWORD",
        value: "hunter2",
      }).success
    ).toBe(false)
  })
})

describe("databases", () => {
  it("name an engine and an optional database", () => {
    expect(DbParamsSchema.safeParse({ engine: "postgres" }).success).toBe(true)
    expect(
      DbParamsSchema.safeParse({ engine: "mysql", name: "flymate" }).success
    ).toBe(true)
    expect(DbParamsSchema.safeParse({ engine: "sqlite" }).success).toBe(false)
  })

  it("accept dump, import, shell and url results", () => {
    expect(
      DbDumpResultSchema.safeParse({
        path: "/home/dev/dumps/flymate.sql.gz",
        size_bytes: 1024,
      }).success
    ).toBe(true)
    expect(
      DbImportResultSchema.safeParse({ imported: ["flymate.sql.gz"] }).success
    ).toBe(true)
    expect(
      DbShellResultSchema.safeParse({ command: "psql flymate" }).success
    ).toBe(true)
    expect(
      DbUrlResultSchema.safeParse({
        url: "postgres://flymate@127.0.0.1:5432/flymate",
      }).success
    ).toBe(true)
    expect(DbDumpResultSchema.safeParse({ size_bytes: 1 }).success).toBe(false)
  })
})

describe("tunnel", () => {
  it("describes the tunnel and its routes", () => {
    expect(
      TunnelStatusResultSchema.safeParse({
        provider: "cloudflare",
        installed: true,
        state: "running",
        routes: [
          {
            hostname: "flymate.acme.dev",
            service: "http://127.0.0.1:5173",
            project: "flymate-api",
          },
        ],
      }).success
    ).toBe(true)
    expect(
      TunnelStatusResultSchema.safeParse({ installed: false, state: "absent" })
        .success
    ).toBe(false)
  })

  it("names no provider when no exposure holds the machine", () => {
    expect(
      TunnelStatusResultSchema.safeParse({
        provider: null,
        installed: false,
        state: "absent",
        routes: [],
      }).success
    ).toBe(true)
  })
})
