import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { renderContractSchema } from "../src/contracts"

const OUTPUT = path.resolve(
  import.meta.dir,
  "../../../apps/agent/internal/contract/schema.json"
)

function main(): void {
  const rendered = renderContractSchema()
  const relative = path.relative(process.cwd(), OUTPUT)

  if (process.argv.includes("--check")) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : null

    if (current !== rendered) {
      process.stderr.write(
        `${relative} is stale — run \`bun run contracts:export\` and commit the result.\n`
      )
      process.exit(1)
    }

    process.stdout.write(`${relative} is up to date.\n`)
    return
  }

  mkdirSync(path.dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, rendered)
  process.stdout.write(`Wrote ${relative}.\n`)
}

main()
