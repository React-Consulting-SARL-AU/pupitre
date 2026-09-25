import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createClient } from "@libsql/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "@pupitre/db/client"

// The very SQL files D1 applies, so a broken migration fails here before any environment.
const MIGRATIONS_DIR = join(import.meta.dir, "../../../db/migrations")

const MIGRATION_FILE_RE = /^\d{4}_.*\.sql$/

export interface TestDatabase {
  prisma: PrismaClient
  reset: () => Promise<void>
  stop: () => Promise<void>
}

function migrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => MIGRATION_FILE_RE.test(file))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
}

export async function bootTestDatabase(): Promise<TestDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "pupitre-test-db-"))
  const url = `file:${join(dir, "test.sqlite")}`
  const client = createClient({ url })

  for (const sql of migrations()) {
    await client.executeMultiple(sql)
  }

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  const names = tables.rows.map((row) => String(row.name))
  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) })

  return {
    prisma,
    reset: async () => {
      await client.executeMultiple(
        [
          "PRAGMA foreign_keys = OFF;",
          ...names.map((name) => `DELETE FROM "${name}";`),
          "PRAGMA foreign_keys = ON;",
        ].join(" ")
      )
    },
    stop: async () => {
      await prisma.$disconnect()
      client.close()
      rmSync(dir, { force: true, recursive: true })
    },
  }
}
