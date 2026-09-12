import {
  assertMigrationAllowed,
  targetOf,
  wranglerTarget,
} from "../src/migration-guard"
import { BINDING, fail, wrangler } from "./wrangler"

/**
 * An empty database again: every table dropped, the migrations' ledger
 * included, then every migration applied. What D1 calls a reset is this, and
 * nothing else is reset — the database keeps its identifier and its bindings.
 */

const TABLES_SQL =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"

interface Answer {
  results?: { name: string }[]
}

export function dropStatement(tables: string[]): string {
  return tables.map((table) => `DROP TABLE IF EXISTS "${table}";`).join(" ")
}

try {
  const target = targetOf(process.argv[2])
  const where = wranglerTarget(target)

  assertMigrationAllowed(target, (key) => process.env[key])

  const listed = wrangler(
    ["d1", "execute", BINDING, ...where, "--command", TABLES_SQL, "--json"],
    { capture: true }
  )
  const tables = (JSON.parse(listed) as Answer[]).flatMap((answer) =>
    (answer.results ?? []).map((row) => row.name)
  )

  if (tables.length > 0) {
    wrangler([
      "d1",
      "execute",
      BINDING,
      ...where,
      "--command",
      dropStatement(tables),
    ])
  }

  wrangler(["d1", "migrations", "apply", BINDING, ...where])
} catch (error) {
  fail(error)
}
