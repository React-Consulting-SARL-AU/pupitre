import { describe, expect, it } from "bun:test"
import {
  DbDumpResultSchema,
  DbImportResultSchema,
  DbParamsSchema,
  DbShellResultSchema,
  DbUrlResultSchema,
  SecretEventSchema,
  SecretsSyncParamsSchema,
  ServiceSecretParamsSchema,
  ServiceSecretResultSchema,
  TunnelStatusResultSchema,
} from "./secrets"

describe("secrets", () => {
  it("sync names the project whose environment file is rebuilt", () => {
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
