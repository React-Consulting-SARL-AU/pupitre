export type TEnvGet = (key: string) => string | undefined

export class MigrationGuardError extends Error {}

/** Must match the databases named in `apps/web/wrangler.jsonc`. */
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

/** The production flag must come from the command line, never from a file. */
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

export function wranglerTarget(target: Target): string[] {
  if (target === "local") {
    return ["--local"]
  }

  return ["--env", target, "--remote"]
}
