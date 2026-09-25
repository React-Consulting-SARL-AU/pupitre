import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS_DIR = join(import.meta.dir, "../../../../db/migrations")

const MIGRATION_FILE_RE = /^\d{4}_.*\.sql$/

const DROP_TABLE_RE = /^DROP TABLE "([^"]+)";$/gm

interface Migration {
  name: string
  sql: string
}

interface Column {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface ForeignKey {
  child: string
  parent: string
  from: string
  to: string
}

interface SeededChild {
  migration: string
  child: string
  column: string
  value: Value
}

type Value = string | number

type Row = Record<string, Value>

function migrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => MIGRATION_FILE_RE.test(file))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
    }))
}

function rebuild(table: string): Migration {
  return {
    name: `rebuild_${table}`,
    sql: [
      `CREATE TABLE "new_${table}" AS SELECT * FROM "${table}";`,
      `DROP TABLE "${table}";`,
      `ALTER TABLE "new_${table}" RENAME TO "${table}";`,
    ].join("\n"),
  }
}

function columnsOf(database: Database, table: string): Column[] {
  return database
    .query<Column, [string]>("SELECT * FROM pragma_table_info(?)")
    .all(table)
}

function foreignKeysOf(database: Database, table: string): ForeignKey[] {
  return database
    .query<ForeignKey, [string, string]>(
      'SELECT ? AS "child", "table" AS "parent", "from", "to" FROM pragma_foreign_key_list(?)'
    )
    .all(table, table)
}

function pointingAt(database: Database, parent: string): ForeignKey[] {
  return database
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
    .all()
    .flatMap(({ name }) => foreignKeysOf(database, name))
    .filter((key) => key.parent === parent)
}

function sampleFor(column: Column, serial: number): Value {
  const type = column.type.toUpperCase()

  if (type.includes("INT") || type === "BOOLEAN") {
    return serial
  }

  if (type === "REAL" || type.includes("DECIMAL")) {
    return serial + 0.5
  }

  if (type === "DATETIME") {
    return "2026-09-01T00:00:00.000+00:00"
  }

  if (type === "JSONB") {
    return "{}"
  }

  return `${column.name}_${serial}`
}

function rowFiller(database: Database) {
  let serial = 0

  function insert(table: string, fixed: Row = {}): Row {
    const columns = columnsOf(database, table)
    const values: Row = { ...fixed }

    for (const key of foreignKeysOf(database, table)) {
      const column = columns.find((one) => one.name === key.from)

      if (key.from in values || !(column?.notnull || column?.pk)) {
        continue
      }

      values[key.from] = insert(key.parent)[key.to]
    }

    for (const column of columns) {
      const required = column.notnull || column.pk

      if (column.name in values || !required || column.dflt_value !== null) {
        continue
      }

      serial += 1
      values[column.name] = sampleFor(column, serial)
    }

    const names = Object.keys(values)

    database
      .query(
        `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
      )
      .run(...Object.values(values))

    return values
  }

  return insert
}

function seedChildren(
  database: Database,
  insert: (table: string, fixed?: Row) => Row,
  migration: Migration
): SeededChild[] {
  const existing = new Set(
    database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
      .all()
      .map(({ name }) => name)
  )
  const dropped = [...migration.sql.matchAll(DROP_TABLE_RE)]
    .map((match) => match[1] ?? "")
    .filter((table) => existing.has(table))

  return dropped.flatMap((parent) =>
    pointingAt(database, parent).map((key) => {
      const value = insert(parent)[key.to]

      insert(key.child, { [key.from]: value })

      return {
        migration: migration.name,
        child: key.child,
        column: key.from,
        value,
      }
    })
  )
}

function stillThere(database: Database, seeded: SeededChild): boolean {
  const columns = columnsOf(database, seeded.child)

  if (!columns.some((column) => column.name === seeded.column)) {
    return true
  }

  const found = database
    .query<{ count: number }, [Value]>(
      `SELECT COUNT(*) AS "count" FROM "${seeded.child}" WHERE "${seeded.column}" = ?`
    )
    .get(seeded.value)

  return (found?.count ?? 0) > 0
}

/** Replays the migrations as D1 does, foreign keys on, and names every child row a table rebuild took away. */
function lostChildren(chain: Migration[]): string[] {
  const database = new Database(":memory:")
  const insert = rowFiller(database)
  const lost: string[] = []

  database.exec("PRAGMA foreign_keys = ON;")

  try {
    for (const migration of chain) {
      const seeded = seedChildren(database, insert, migration)

      database.exec(migration.sql)

      for (const one of seeded.filter((row) => !stillThere(database, row))) {
        lost.push(`${one.migration}: ${one.child}.${one.column}`)
      }
    }
  } finally {
    database.close()
  }

  return lost.sort()
}

describe("les migrations qui reconstruisent une table", () => {
  it("gardent les lignes qui pointent vers elle, clés étrangères actives comme sur D1", () => {
    expect(lostChildren(migrations())).toEqual([])
  })

  it("seraient prises en défaut par une reconstruction naïve d'une table référencée", () => {
    expect(
      lostChildren([
        ...migrations(),
        rebuild("AffiliateLink"),
        rebuild("MailMailbox"),
      ])
    ).toEqual([
      "rebuild_AffiliateLink: AffiliateClickDay.linkId",
      "rebuild_AffiliateLink: Referral.linkId",
      "rebuild_MailMailbox: MailTemplate.mailboxId",
      "rebuild_MailMailbox: MailThread.mailboxId",
    ])
  })
})
