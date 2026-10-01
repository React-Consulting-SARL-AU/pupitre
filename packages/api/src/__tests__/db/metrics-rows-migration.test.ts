import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Client, createClient } from "@libsql/client"

const MIGRATIONS_DIR = join(import.meta.dir, "../../../../db/migrations")

const MIGRATION_FILE_RE = /^\d{4}_.*\.sql$/

const METRICS_ROWS = "0012_metrics_rows.sql"

function migrationsBefore(last: string): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => MIGRATION_FILE_RE.test(file) && file < last)
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
}

function metricsRows(): string {
  return readFileSync(join(MIGRATIONS_DIR, METRICS_ROWS), "utf8")
}

async function seedServer(
  client: Client,
  input: { id: string; metrics: string | null }
): Promise<void> {
  await client.execute({
    sql: 'INSERT INTO "Server" ("id", "organizationId", "name", "arch", "updatedAt", "metrics") VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
    args: [input.id, "org_1", input.id, "amd64", input.metrics],
  })
}

describe("migration 0012 on an already populated database", () => {
  let dir: string
  let client: Client

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "pupitre-metrics-rows-"))
    client = createClient({ url: `file:${join(dir, "test.sqlite")}` })

    for (const sql of migrationsBefore(METRICS_ROWS)) {
      await client.executeMultiple(sql)
    }

    await client.execute({
      sql: 'INSERT INTO "organization" ("id", "name", "slug", "createdAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      args: ["org_1", "Atelier", "atelier"],
    })

    await seedServer(client, {
      id: "srv_fenetre",
      metrics: JSON.stringify({
        samples: [
          {
            at: "2026-09-15T10:00:00.000Z",
            disk: 0.41,
            ram: 0.55,
            load: 1.2,
            sessions: ["dev"],
            stack_version: "1.0.0",
            modules: ["core.system"],
          },
          {
            at: "2026-09-16T10:05:00.000Z",
            disk: 0.42,
            ram: 0.56,
            load: 0.8,
            sessions: [],
            stack_version: "1.0.0",
            modules: [],
          },
        ],
      }),
    })
    await seedServer(client, { id: "srv_muette", metrics: null })
    await seedServer(client, {
      id: "srv_vide",
      metrics: JSON.stringify({ samples: [] }),
    })
    await client.executeMultiple(metricsRows())
  })

  afterAll(() => {
    client.close()
    rmSync(dir, { force: true, recursive: true })
  })

  it("carries each reading of the window as a row, timestamped the way the client writes", async () => {
    const rows = await client.execute(
      'SELECT "serverId", "at", json_extract("sample", \'$.disk\') AS disk FROM "ServerMetric" ORDER BY "at"'
    )

    expect(rows.rows).toHaveLength(2)
    expect(rows.rows.map((row) => row.serverId)).toEqual([
      "srv_fenetre",
      "srv_fenetre",
    ])
    expect(rows.rows[0]?.at).toBe("2026-09-15T10:00:00.000+00:00")
    expect(rows.rows[1]?.at).toBe("2026-09-16T10:05:00.000+00:00")
    expect(rows.rows[1]?.disk).toBe(0.42)
  })

  it("drops the column, and lets the indexes read the windows", async () => {
    const columns = await client.execute("PRAGMA table_info(Server)")

    expect(columns.rows.map((row) => row.name)).not.toContain("metrics")

    const indexes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ServerMetric'"
    )

    expect(indexes.rows.map((row) => row.name)).toContain(
      "ServerMetric_serverId_at_idx"
    )
  })

  it("would keep the window filter correct: a migration row reads like a client row", async () => {
    await client.execute(
      'INSERT INTO "ServerMetric" ("id", "serverId", "at", "sample") VALUES (\'row_client\', \'srv_fenetre\', \'2026-09-17T10:00:00.000+00:00\', \'{"at":"2026-09-17T10:00:00.000Z","disk":0.5}\')'
    )

    const from = await client.execute(
      'SELECT COUNT(*) AS kept FROM "ServerMetric" WHERE "at" >= \'2026-09-16T00:00:00.000+00:00\''
    )

    expect(from.rows[0]?.kept).toBe(2)
  })
})
