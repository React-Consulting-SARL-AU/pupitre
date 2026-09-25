import {
  assertMigrationAllowed,
  targetOf,
  wranglerTarget,
} from "../src/migration-guard"
import { BINDING, fail, wrangler } from "./wrangler"

try {
  const target = targetOf(process.argv[2])

  assertMigrationAllowed(target, (key) => process.env[key])
  wrangler(["d1", "migrations", "apply", BINDING, ...wranglerTarget(target)])
} catch (error) {
  fail(error)
}
