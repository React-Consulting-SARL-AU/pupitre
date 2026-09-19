import { Database } from "bun:sqlite"
import { spawnSync } from "node:child_process"
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { DB_DIR, fail, MIGRATIONS_DIR } from "./wrangler"

/**
 * The next migration, as D1 will apply it: the migrations so far replayed on
 * a throwaway SQLite, then the schema diffed against it.
 *
 *   bun run db:migrate:new add-server-notes
 */

const NAME_RE = /^[a-z0-9-]+$/

const FILE_RE = /^(\d{4})_.*\.sql$/

export function nextFileName(existing: string[], name: string): string {
  const highest = Math.max(
    0,
    ...existing.map((file) => Number(file.match(FILE_RE)?.[1] ?? 0))
  )

  return `${String(highest + 1).padStart(4, "0")}_${name.replaceAll("-", "_")}.sql`
}

const FOREIGN_KEYS_PRAGMA_RE = /^PRAGMA foreign_keys=(ON|OFF);\n/gm

/** D1 refuses to switch foreign keys off and on; it defers them instead, which Prisma's script also asks for. */
export function forD1(script: string): string {
  return script.replace(FOREIGN_KEYS_PRAGMA_RE, "")
}

export function migrationFiles(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => FILE_RE.test(file))
    .sort()
}

export function replayMigrations(
  database: Database,
  dir = MIGRATIONS_DIR
): void {
  for (const file of migrationFiles(dir)) {
    database.exec(readFileSync(path.join(dir, file), "utf8"))
  }
}

function main(): void {
  const name = process.argv[2]

  if (!(name && NAME_RE.test(name))) {
    throw new Error(
      "usage: bun run db:migrate:new <name>, in lowercase and dashes"
    )
  }

  const files = migrationFiles()
  const temp = mkdtempSync(path.join(tmpdir(), "pupitre-shadow-"))
  const shadow = path.join(temp, "shadow.sqlite")

  try {
    const database = new Database(shadow)

    replayMigrations(database)
    database.close()

    const diff = spawnSync(
      "bun",
      [
        "x",
        "prisma",
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--script",
      ],
      {
        cwd: DB_DIR,
        encoding: "utf8",
        env: { ...process.env, PUPITRE_MIGRATIONS_SHADOW: `file:${shadow}` },
        stdio: ["inherit", "pipe", "inherit"],
      }
    )

    if (diff.status !== 0) {
      throw new Error(`prisma migrate diff exited with ${diff.status}`)
    }

    if (diff.stdout.includes("This is an empty migration")) {
      throw new Error("the schema and the migrations agree: nothing to write.")
    }

    const file = nextFileName(files, name)

    writeFileSync(path.join(MIGRATIONS_DIR, file), forD1(diff.stdout))
    console.log(
      `${path.relative(process.cwd(), path.join(MIGRATIONS_DIR, file))} — read it, then bun run db:migrate local`
    )
  } finally {
    rmSync(temp, { force: true, recursive: true })
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    fail(error)
  }
}
