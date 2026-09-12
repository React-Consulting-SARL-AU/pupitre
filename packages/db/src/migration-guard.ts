export type TEnvGet = (key: string) => string | undefined

export class MigrationGuardError extends Error {}

/** The two databases, as `apps/web/wrangler.jsonc` names them: the local one miniflare keeps, and the production D1. */
export const TARGETS = ["local", "production"] as const

export type Target = (typeof TARGETS)[number]

const FLAG = "PUPITRE_ALLOW_MIGRATE_ON"

export function targetOf(value: string | undefined): Target {
  const target = TARGETS.find((one) => one === value)

  if (!target) {
    throw new MigrationGuardError(
      `${value ? `"${value}"` : "no target"} is not a database: local or production.`
    )
  }

  return target
}

/** Production is written on purpose: the flag comes from the command line, never from a file. */
export function assertMigrationAllowed(target: Target, get: TEnvGet): void {
  if (target === "production" && get(FLAG) !== "production") {
    throw new MigrationGuardError(
      [
        `Refused: production is only touched with ${FLAG}=production on the command line.`,
        `  → ${FLAG}=production bun run db:migrate production`,
      ].join("\n")
    )
  }
}

/** What wrangler needs to reach the target, after `d1 migrations apply DB`. */
export function wranglerTarget(target: Target): string[] {
  if (target === "local") {
    return ["--local"]
  }

  return ["--env", target, "--remote"]
}
