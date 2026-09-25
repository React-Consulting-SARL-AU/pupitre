import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  assertNoCascadingDrop,
  forD1,
  nextFileName,
  referencingTables,
  replayMigrations,
  schemaDiff,
} from "./new-migration"
import { MIGRATIONS_DIR } from "./wrangler"

function replayedReferences(): Map<string, string[]> {
  const database = new Database(":memory:")

  replayMigrations(database)

  const references = referencingTables(database)

  database.close()

  return references
}

function redefinition(table: string): string {
  return [
    "PRAGMA defer_foreign_keys=ON;",
    `CREATE TABLE "new_${table}" ("id" TEXT NOT NULL PRIMARY KEY);`,
    `INSERT INTO "new_${table}" ("id") SELECT "id" FROM "${table}";`,
    `DROP TABLE "${table}";`,
    `ALTER TABLE "new_${table}" RENAME TO "${table}";`,
    "PRAGMA defer_foreign_keys=OFF;",
    "",
  ].join("\n")
}

describe("the next migration file", () => {
  it("follows the last number and keeps D1 out of the foreign-keys pragma", () => {
    expect(nextFileName([], "init")).toBe("0001_init.sql")
    expect(nextFileName(["0001_init.sql", "0002_x.sql"], "add-notes")).toBe(
      "0003_add_notes.sql"
    )
    expect(
      forD1(
        "PRAGMA defer_foreign_keys=ON;\nPRAGMA foreign_keys=OFF;\nCREATE TABLE x (id TEXT);\nPRAGMA foreign_keys=ON;\nPRAGMA defer_foreign_keys=OFF;\n"
      )
    ).toBe(
      "PRAGMA defer_foreign_keys=ON;\nCREATE TABLE x (id TEXT);\nPRAGMA defer_foreign_keys=OFF;\n"
    )
  })

  it("knows which tables point at which", () => {
    const references = replayedReferences()

    expect(references.get("Server")).toEqual(
      expect.arrayContaining(["Alert", "ServerRevokedDevice", "Backup"])
    )
    expect(references.get("MailMailbox")).toEqual([
      "MailTemplate",
      "MailThread",
    ])
    expect(references.has("MailDraft")).toBe(false)
  })

  it("refuses to drop a table another one points at, and says how to write it by hand", () => {
    const references = replayedReferences()

    expect(() =>
      assertNoCascadingDrop(redefinition("AffiliateLink"), references)
    ).toThrow(
      'Refused: this migration drops "AffiliateLink", which "AffiliateClickDay", "Referral" point at.'
    )
    expect(() =>
      assertNoCascadingDrop(redefinition("MailMailbox"), references)
    ).toThrow("ALTER TABLE")
    expect(() =>
      assertNoCascadingDrop(
        readFileSync(
          path.join(MIGRATIONS_DIR, "0012_metrics_rows.sql"),
          "utf8"
        ),
        references
      )
    ).toThrow('drops "Server"')
  })

  it("lets a table nothing points at be rebuilt", () => {
    const references = replayedReferences()

    expect(() =>
      assertNoCascadingDrop(redefinition("MailDraft"), references)
    ).not.toThrow()
    expect(() =>
      assertNoCascadingDrop(
        'ALTER TABLE "Server" ADD COLUMN "notes" TEXT;\n',
        references
      )
    ).not.toThrow()
  })
})

describe("the schema and the migrations", () => {
  it("describe the same database, so the next migration only holds what is new", () => {
    const temp = mkdtempSync(path.join(tmpdir(), "pupitre-shadow-test-"))
    const shadow = path.join(temp, "shadow.sqlite")

    try {
      const database = new Database(shadow)

      replayMigrations(database)
      database.close()

      expect(schemaDiff(shadow)).toBeNull()
    } finally {
      rmSync(temp, { force: true, recursive: true })
    }
  }, 60_000)
})
