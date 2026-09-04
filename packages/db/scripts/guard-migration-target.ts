import { config } from "dotenv"
import {
  assertMigrationAllowed,
  MigrationGuardError,
} from "../src/migration-guard"

// The flag must come from the command line, never from .env.local: a migration is an explicit act.
const allowedTarget = process.env.PUPITRE_ALLOW_MIGRATE_ON

config({ path: "../../.env.local", override: false, quiet: true })

try {
  assertMigrationAllowed((key) =>
    key === "PUPITRE_ALLOW_MIGRATE_ON" ? allowedTarget : process.env[key]
  )
} catch (error) {
  if (!(error instanceof MigrationGuardError)) {
    throw error
  }

  console.error(error.message)
  process.exit(1)
}
