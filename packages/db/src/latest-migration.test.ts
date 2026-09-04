import { describe, expect, it } from "bun:test"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { LATEST_MIGRATION } from "./latest-migration"

const MIGRATIONS_DIR = join(import.meta.dir, "..", "prisma", "migrations")

function migrationDirectories(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

describe("latest migration", () => {
  it("matches the newest migration directory", () => {
    expect(LATEST_MIGRATION).toBe(migrationDirectories().at(-1) ?? "")
  })

  it("names a migration that exists on disk", () => {
    expect(migrationDirectories()).toContain(LATEST_MIGRATION)
  })
})
