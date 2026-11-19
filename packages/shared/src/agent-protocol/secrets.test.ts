import { describe, expect, it } from "bun:test"
import {
  DB_QUERY,
  DbDumpResultSchema,
  DbImportResultSchema,
  DbParamsSchema,
  DbQueryParamsSchema,
  DbQueryResultSchema,
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
      SecretsSyncParamsSchema.safeParse({ project: "flyleaf-api" }).success
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
      DbParamsSchema.safeParse({ engine: "mysql", name: "flyleaf" }).success
    ).toBe(true)
    expect(DbParamsSchema.safeParse({ engine: "sqlite" }).success).toBe(false)
  })

  it("accept dump, import, shell and url results", () => {
    expect(
      DbDumpResultSchema.safeParse({
        path: "/home/dev/dumps/flyleaf.sql.gz",
        size_bytes: 1024,
      }).success
    ).toBe(true)
    expect(
      DbImportResultSchema.safeParse({ imported: ["flyleaf.sql.gz"] }).success
    ).toBe(true)
    expect(
      DbShellResultSchema.safeParse({ command: "psql flyleaf" }).success
    ).toBe(true)
    expect(
      DbUrlResultSchema.safeParse({
        url: "postgres://flyleaf@127.0.0.1:5432/flyleaf",
      }).success
    ).toBe(true)
    expect(DbDumpResultSchema.safeParse({ size_bytes: 1 }).success).toBe(false)
  })

  it("query one database with a statement of bounded length", () => {
    expect(
      DbQueryParamsSchema.safeParse({
        engine: "postgres",
        name: "flyleaf",
        query: "SELECT 1",
      }).success
    ).toBe(true)
    expect(
      DbQueryParamsSchema.safeParse({ engine: "postgres", query: "" }).success
    ).toBe(false)
    expect(
      DbQueryParamsSchema.safeParse({
        engine: "redis",
        name: "1",
        query: "GET session:42",
      }).success
    ).toBe(true)
    expect(DbParamsSchema.safeParse({ engine: "redis" }).success).toBe(false)
    expect(
      DbQueryParamsSchema.safeParse({
        engine: "mysql",
        query: "x".repeat(DB_QUERY.query_max_length + 1),
      }).success
    ).toBe(false)
    expect(
      DbQueryParamsSchema.safeParse({
        engine: "mongodb",
        query: "db.users.find()",
        password: "hunter2",
      }).success
    ).toBe(false)
  })

  it("answer a query with the client's output, cut and failed or not", () => {
    expect(
      DbQueryResultSchema.safeParse({
        output: " ?column? \n----------\n        1\n(1 row)\n",
        truncated: false,
        failed: false,
      }).success
    ).toBe(true)
    expect(DbQueryResultSchema.safeParse({ output: "" }).success).toBe(false)
  })

  it("keep a query under the time an MCP client waits for a tool", () => {
    expect(DB_QUERY.timeout_ms).toBeLessThan(60_000)
    expect(DB_QUERY.output_max_bytes).toBeGreaterThan(0)
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
            hostname: "flyleaf.acme.dev",
            service: "http://127.0.0.1:5173",
            project: "flyleaf-api",
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
