export type TEnvGet = (key: string) => string | undefined

export class MigrationGuardError extends Error {}

const ALLOWED_TARGETS = ["staging", "local", "production"] as const

const POOLER_SUFFIX = "-pooler"
const NEON_HOST_SUFFIX = ".neon.tech"

function hostname(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname
  } catch {
    return null
  }
}

function neonEndpointId(connectionString: string): string | null {
  const host = hostname(connectionString)

  if (!host?.endsWith(NEON_HOST_SUFFIX)) {
    return null
  }

  const [endpoint] = host.split(".")

  return endpoint?.replace(POOLER_SUFFIX, "") ?? null
}

function isPooledNeonHost(connectionString: string): boolean {
  const host = hostname(connectionString)

  return Boolean(
    host?.endsWith(NEON_HOST_SUFFIX) &&
      host.split(".")[0]?.endsWith(POOLER_SUFFIX)
  )
}

function requireMigrateUrl(get: TEnvGet): string {
  const url = get("MIGRATE_DATABASE_URL")

  if (!url) {
    throw new MigrationGuardError(
      "MIGRATE_DATABASE_URL is required: the direct (non-pooled) endpoint of the Neon branch to migrate. Set it in .env.local, or in the build environment for deployments."
    )
  }

  return url
}

export function assertMigrationAllowed(get: TEnvGet): void {
  const target = get("PUPITRE_ALLOW_MIGRATE_ON")

  if (!ALLOWED_TARGETS.includes(target as (typeof ALLOWED_TARGETS)[number])) {
    throw new MigrationGuardError(
      [
        `Migration refused: PUPITRE_ALLOW_MIGRATE_ON is ${target === undefined ? "unset" : `"${target}"`}, it must be "staging", "local" or "production".`,
        "  → PUPITRE_ALLOW_MIGRATE_ON=staging bun run db:migrate",
        "Production takes it from its own environment only: bun run env production -- env PUPITRE_ALLOW_MIGRATE_ON=production bun run db:migrate:reset",
      ].join("\n")
    )
  }

  const url = requireMigrateUrl(get)

  if (isPooledNeonHost(url)) {
    throw new MigrationGuardError(
      "MIGRATE_DATABASE_URL points at a Neon -pooler endpoint. Migrations need the direct endpoint of the branch."
    )
  }
}

export function assertDeployTarget(get: TEnvGet): void {
  const migrateEndpoint = neonEndpointId(requireMigrateUrl(get))
  const runtimeUrl = get("DATABASE_URL")

  if (!(migrateEndpoint && runtimeUrl)) {
    return
  }

  const runtimeEndpoint = neonEndpointId(runtimeUrl)

  if (runtimeEndpoint && runtimeEndpoint !== migrateEndpoint) {
    throw new MigrationGuardError(
      [
        "Refusing to migrate: MIGRATE_DATABASE_URL and DATABASE_URL point at different Neon branches.",
        `  migration endpoint : ${migrateEndpoint}`,
        `  runtime endpoint   : ${runtimeEndpoint}`,
        "Migrating one branch while the Worker reads another deploys green and breaks at runtime. Point both at the same branch.",
      ].join("\n")
    )
  }
}
