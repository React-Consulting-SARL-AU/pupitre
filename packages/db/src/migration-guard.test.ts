import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"
import {
  assertDeployTarget,
  assertMigrationAllowed,
  MigrationGuardError,
} from "./migration-guard"

const DB_DIR = path.resolve(import.meta.dir, "..")
const DEV_GUARD = path.join(DB_DIR, "scripts/guard-migration-target.ts")
const DEPLOY_GUARD = path.join(
  DB_DIR,
  "scripts/require-migrate-database-url.ts"
)

const STAGING_DIRECT =
  "postgresql://app:secret@ep-quiet-sea-a1b2c3d4.eu-central-1.aws.neon.tech/neondb?sslmode=require"
const STAGING_POOLED =
  "postgresql://app:secret@ep-quiet-sea-a1b2c3d4-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require"
const OTHER_DIRECT =
  "postgresql://app:secret@ep-other-branch-z9y8x7w6.eu-central-1.aws.neon.tech/neondb?sslmode=require"

function env(values: Record<string, string | undefined>) {
  return (key: string) => values[key]
}

function runGuard(script: string, extra: Record<string, string>) {
  const cleanEnv: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      key !== "PUPITRE_ALLOW_MIGRATE_ON" &&
      key !== "MIGRATE_DATABASE_URL" &&
      key !== "DATABASE_URL"
    ) {
      cleanEnv[key] = value
    }
  }

  return spawnSync("bun", [script], {
    cwd: DB_DIR,
    env: { ...cleanEnv, ...extra },
    encoding: "utf8",
  })
}

describe("assertMigrationAllowed", () => {
  it("refuses when PUPITRE_ALLOW_MIGRATE_ON is unset", () => {
    expect(() =>
      assertMigrationAllowed(env({ MIGRATE_DATABASE_URL: STAGING_DIRECT }))
    ).toThrow(MigrationGuardError)
    expect(() =>
      assertMigrationAllowed(env({ MIGRATE_DATABASE_URL: STAGING_DIRECT }))
    ).toThrow("PUPITRE_ALLOW_MIGRATE_ON")
  })

  it("refuses production and any other value", () => {
    for (const value of ["production", "main", "true", "1", "Staging"]) {
      expect(() =>
        assertMigrationAllowed(
          env({
            PUPITRE_ALLOW_MIGRATE_ON: value,
            MIGRATE_DATABASE_URL: STAGING_DIRECT,
          })
        )
      ).toThrow('must be "staging" or "local"')
    }
  })

  it("refuses without MIGRATE_DATABASE_URL", () => {
    expect(() =>
      assertMigrationAllowed(env({ PUPITRE_ALLOW_MIGRATE_ON: "staging" }))
    ).toThrow("MIGRATE_DATABASE_URL")
  })

  it("refuses a pooled Neon endpoint for migrations", () => {
    expect(() =>
      assertMigrationAllowed(
        env({
          PUPITRE_ALLOW_MIGRATE_ON: "staging",
          MIGRATE_DATABASE_URL: STAGING_POOLED,
        })
      )
    ).toThrow("-pooler")
  })

  it("accepts staging and local", () => {
    for (const value of ["staging", "local"]) {
      expect(() =>
        assertMigrationAllowed(
          env({
            PUPITRE_ALLOW_MIGRATE_ON: value,
            MIGRATE_DATABASE_URL: STAGING_DIRECT,
          })
        )
      ).not.toThrow()
    }
  })
})

describe("assertDeployTarget", () => {
  it("requires MIGRATE_DATABASE_URL", () => {
    expect(() => assertDeployTarget(env({}))).toThrow("MIGRATE_DATABASE_URL")
  })

  it("accepts a lone migration URL", () => {
    expect(() =>
      assertDeployTarget(env({ MIGRATE_DATABASE_URL: STAGING_DIRECT }))
    ).not.toThrow()
  })

  it("accepts a runtime URL on the same Neon branch, pooled or not", () => {
    expect(() =>
      assertDeployTarget(
        env({
          MIGRATE_DATABASE_URL: STAGING_DIRECT,
          DATABASE_URL: STAGING_POOLED,
        })
      )
    ).not.toThrow()
  })

  it("refuses a runtime URL on another Neon branch", () => {
    expect(() =>
      assertDeployTarget(
        env({
          MIGRATE_DATABASE_URL: OTHER_DIRECT,
          DATABASE_URL: STAGING_POOLED,
        })
      )
    ).toThrow("different Neon branches")
  })

  it("ignores a non-Neon runtime URL", () => {
    expect(() =>
      assertDeployTarget(
        env({
          MIGRATE_DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
          DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
        })
      )
    ).not.toThrow()
  })
})

describe("guard scripts", () => {
  it("guard-migration-target refuses without PUPITRE_ALLOW_MIGRATE_ON", () => {
    const result = runGuard(DEV_GUARD, { MIGRATE_DATABASE_URL: STAGING_DIRECT })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("PUPITRE_ALLOW_MIGRATE_ON")
    expect(result.stderr).not.toContain("secret")
  })

  it("guard-migration-target passes with staging", () => {
    const result = runGuard(DEV_GUARD, {
      PUPITRE_ALLOW_MIGRATE_ON: "staging",
      MIGRATE_DATABASE_URL: STAGING_DIRECT,
    })

    expect(result.status).toBe(0)
  })

  it("require-migrate-database-url refuses mismatched branches", () => {
    const result = runGuard(DEPLOY_GUARD, {
      MIGRATE_DATABASE_URL: OTHER_DIRECT,
      DATABASE_URL: STAGING_POOLED,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("different Neon branches")
    expect(result.stderr).not.toContain("secret")
  })
})
