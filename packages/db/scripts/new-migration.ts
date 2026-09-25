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

const DROP_TABLE_RE = /^DROP TABLE "([^"]+)";$/gm

/** Every table a foreign key points at, with the tables that point at it. */
export function referencingTables(database: Database): Map<string, string[]> {
  const rows = database
    .query<{ child: string; parent: string }, []>(
      `SELECT DISTINCT "table"."name" AS "child", "key"."table" AS "parent"
       FROM "sqlite_master" AS "table", pragma_foreign_key_list("table"."name") AS "key"
       WHERE "table"."type" = 'table'
       ORDER BY "child"`
    )
    .all()
  const references = new Map<string, string[]>()

  for (const { child, parent } of rows) {
    references.set(parent, [...(references.get(parent) ?? []), child])
  }

  return references
}

export function assertNoCascadingDrop(
  script: string,
  references: Map<string, string[]>
): void {
  const dropped = [...script.matchAll(DROP_TABLE_RE)]
    .map((match) => match[1] ?? "")
    .filter((table) => references.has(table))

  if (dropped.length === 0) {
    return
  }

  const quote = (tables: string[]) =>
    tables.map((table) => `"${table}"`).join(", ")

  throw new Error(
    [
      ...dropped.map(
        (table) =>
          `Refused: this migration drops "${table}", which ${quote(references.get(table) ?? [])} point at.`
      ),
      "D1 keeps foreign keys on, and PRAGMA defer_foreign_keys does not hold back ON DELETE actions: DROP TABLE deletes every row first, so those tables lose their rows (CASCADE) or their links (SET NULL) for good.",
      "Write this migration by hand in packages/db/migrations/NNNN_<name>.sql:",
      "  → prefer ALTER TABLE … ADD COLUMN, DROP COLUMN or RENAME COLUMN, which keep the table in place;",
      "  → if the table must be rebuilt, copy each table that points at it aside before DROP TABLE and put the rows back after the rename, as 0012_metrics_rows.sql does.",
      "Then bun run db:migrate:new <name> must answer that nothing is left to write.",
      "",
      "What Prisma generated, to start from:",
      "",
      script,
    ].join("\n")
  )
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

/** What the schema asks of a database built by the migrations, or null when they agree. */
export function schemaDiff(shadow: string): string | null {
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
      stdio: ["inherit", "pipe", "pipe"],
    }
  )

  if (diff.status !== 0) {
    throw new Error(
      `prisma migrate diff exited with ${diff.status}\n${diff.stderr}`
    )
  }

  return diff.stdout.includes("This is an empty migration") ? null : diff.stdout
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

    const references = referencingTables(database)

    database.close()

    const diff = schemaDiff(shadow)

    if (diff === null) {
      throw new Error("the schema and the migrations agree: nothing to write.")
    }

    const script = forD1(diff)

    assertNoCascadingDrop(script, references)

    const file = nextFileName(files, name)

    writeFileSync(path.join(MIGRATIONS_DIR, file), script)
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
