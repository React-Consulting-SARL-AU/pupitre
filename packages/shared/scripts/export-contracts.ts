import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { renderContractSchema } from "../src/contracts"

const AGENT_CONTRACT = path.resolve(
  import.meta.dir,
  "../../../apps/agent/internal/contract"
)

const FIXTURES = path.resolve(
  import.meta.dir,
  "../src/catalog/validate.fixtures.json"
)

interface Artefact {
  output: string
  content: string
}

/**
 * The field fixtures travel with the schema: they are the only proof that the
 * app and the agent refuse the same value for the same reason, and a Go test
 * that read them across the workspaces would break the day one moves.
 */
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
