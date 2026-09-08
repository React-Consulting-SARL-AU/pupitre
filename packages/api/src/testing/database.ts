import { readdirSync, readFileSync } from "node:fs"
import { createServer } from "node:net"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@pupitre/db/client"

const MIGRATIONS_DIR = join(import.meta.dir, "../../../db/prisma/migrations")
const MIGRATIONS_TABLE = "_prisma_migrations"

export interface TestDatabase {
  pglite: PGlite
  prisma: PrismaClient
  reset: () => Promise<void>
  stop: () => Promise<void>
}

interface Migration {
  name: string
  sql: string
}

function migrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"),
    }))
}

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()

    probe.unref()
    probe.on("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()

      if (!address || typeof address === "string") {
        reject(new Error("could not pick a free port"))

        return
      }

      probe.close(() => resolve(address.port))
    })
  })
}

async function applyMigrations(pglite: PGlite): Promise<void> {
  for (const migration of migrations()) {
    try {
      await pglite.exec(migration.sql)
    } catch (error) {
      throw new Error(`migration ${migration.name} failed on PGlite`, {
        cause: error,
      })
    }
  }
}

async function truncateSql(pglite: PGlite): Promise<string> {
  const result = await pglite.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  )
  const tables = result.rows
    .map((row) => row.tablename)
    .filter((table) => table !== MIGRATIONS_TABLE)
    .map((table) => `"${table}"`)

  return `TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`
}

export async function bootTestDatabase(): Promise<TestDatabase> {
  const pglite = new PGlite()

  await pglite.waitReady
  await applyMigrations(pglite)

  const port = await pickFreePort()
  const server = new PGLiteSocketServer({ db: pglite, host: "127.0.0.1", port })

  await server.start()

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password: "postgres",
      database: "postgres",
      ssl: false,
      max: 1,
      // One connection, kept for the life of the process. Reaping it on idle
      // races the next checkout, and the query that follows dies on a socket
      // the pool had already closed.
      idleTimeoutMillis: 0,
      allowExitOnIdle: false,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  })
  const truncate = await truncateSql(pglite)

  return {
    pglite,
    prisma,
    reset: async () => {
      await prisma.$executeRawUnsafe(truncate)
    },
    stop: async () => {
      await prisma.$disconnect()
      await server.stop()
      await pglite.close()
    },
  }
}
