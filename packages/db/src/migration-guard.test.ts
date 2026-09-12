import { describe, expect, it } from "bun:test"
import {
  assertMigrationAllowed,
  MigrationGuardError,
  targetOf,
  wranglerTarget,
} from "./migration-guard"

function env(values: Record<string, string | undefined>) {
  return (key: string) => values[key]
}

describe("the database a migration reaches", () => {
  it("is one of the two, named on the command line", () => {
    expect(targetOf("local")).toBe("local")
    expect(() => targetOf("staging")).toThrow("local or production")
    expect(targetOf("production")).toBe("production")
    expect(() => targetOf("prod")).toThrow(MigrationGuardError)
    expect(() => targetOf(undefined)).toThrow("no target is not a database")
  })

  it("lets local through, and production with the flag only", () => {
    expect(() => assertMigrationAllowed("local", env({}))).not.toThrow()
    expect(() => assertMigrationAllowed("production", env({}))).toThrow(
      "PUPITRE_ALLOW_MIGRATE_ON=production"
    )
    expect(() =>
      assertMigrationAllowed(
        "production",
        env({ PUPITRE_ALLOW_MIGRATE_ON: "local" })
      )
    ).toThrow(MigrationGuardError)
    expect(() =>
      assertMigrationAllowed(
        "production",
        env({ PUPITRE_ALLOW_MIGRATE_ON: "production" })
      )
    ).not.toThrow()
  })

  it("tells wrangler which database that is", () => {
    expect(wranglerTarget("local")).toEqual(["--local"])
    expect(wranglerTarget("production")).toEqual([
      "--env",
      "production",
      "--remote",
    ])
  })
})
