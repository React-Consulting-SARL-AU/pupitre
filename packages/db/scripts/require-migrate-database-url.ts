import { config } from "dotenv"
import { assertDeployTarget, MigrationGuardError } from "../src/migration-guard"

config({ path: "../../.env.local", override: false, quiet: true })

try {
  assertDeployTarget((key) => process.env[key])
} catch (error) {
  if (!(error instanceof MigrationGuardError)) {
    throw error
  }

  console.error(error.message)
  process.exit(1)
}
