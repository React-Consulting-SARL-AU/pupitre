import {
  assertMigrationAllowed,
  targetOf,
  wranglerTarget,
} from "../src/migration-guard"
import { BINDING, fail, wrangler } from "./wrangler"

/**
 * Every migration the target has not applied yet, in order, through wrangler:
 *
 *   bun run db:migrate local
 *   bun run db:migrate staging
 *   PUPITRE_ALLOW_MIGRATE_ON=production bun run db:migrate production
 */

try {
  const target = targetOf(process.argv[2])

  assertMigrationAllowed(target, (key) => process.env[key])
  wrangler(["d1", "migrations", "apply", BINDING, ...wranglerTarget(target)])
} catch (error) {
  fail(error)
}
