import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { renderContractSchema } from "../src/contracts"
import { PUPITRE_ORIGINS } from "../src/legal"
import { PLATFORM_API_PATH } from "../src/platform-api"

const AGENT_CONTRACT = path.resolve(
  import.meta.dir,
  "../../../apps/agent/internal/contract"
)

const FIXTURES = path.resolve(
  import.meta.dir,
  "../src/catalog/validate.fixtures.json"
)

const BACKUP_FIXTURES = path.resolve(
  import.meta.dir,
  "../src/backup/fixtures.json"
)

const KEY_APPROVAL_FIXTURES = path.resolve(
  import.meta.dir,
  "../src/keys/fixtures.json"
)

interface Artefact {
  output: string
  content: string
}

// Product names stay out of schema.json, so a Go test holds the agent's default platform to this.
function platformFixtures(): string {
  const platform = {
    api_url: `${PUPITRE_ORIGINS.app}${PLATFORM_API_PATH}`,
  }

  return `${JSON.stringify(platform, null, 2)}\n`
}

// Fixtures are copied beside the schema: a Go test reading them across workspaces would break the day one moves.
function artefacts(): Artefact[] {
  return [
    {
      content: renderContractSchema(),
      output: path.join(AGENT_CONTRACT, "schema.json"),
    },
    {
      content: readFileSync(FIXTURES, "utf8"),
      output: path.join(AGENT_CONTRACT, "fields.fixtures.json"),
    },
    {
      content: readFileSync(BACKUP_FIXTURES, "utf8"),
      output: path.join(AGENT_CONTRACT, "backup.fixtures.json"),
    },
    {
      content: readFileSync(KEY_APPROVAL_FIXTURES, "utf8"),
      output: path.join(AGENT_CONTRACT, "key-approval.fixtures.json"),
    },
    {
      content: platformFixtures(),
      output: path.join(AGENT_CONTRACT, "platform.fixtures.json"),
    },
  ]
}

function main(): void {
  const checking = process.argv.includes("--check")

  for (const { output, content } of artefacts()) {
    const relative = path.relative(process.cwd(), output)

    if (checking) {
      const current = existsSync(output) ? readFileSync(output, "utf8") : null

      if (current !== content) {
        process.stderr.write(
          `${relative} is stale — run \`bun run contracts:export\` and commit the result.\n`
        )
        process.exit(1)
      }

      process.stdout.write(`${relative} is up to date.\n`)
      continue
    }

    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, content)
    process.stdout.write(`Wrote ${relative}.\n`)
  }
}

main()
