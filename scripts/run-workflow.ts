import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "./bootstrap-local"

// Cron Triggers never fire locally; unknown names are refused by the Worker, which holds the only list.

const ROOT = join(import.meta.dir, "..")
const ENV_FILE = join(ROOT, ".env.local")
const CONSOLE_URL = process.env.PUPITRE_CONSOLE_URL ?? "http://localhost:3000"
const SECRET_HEADER = "x-pupitre-internal-secret"

function fail(message: string, fix?: string): never {
  process.stderr.write(`workflow: ${message}\n`)

  if (fix) {
    process.stderr.write(`workflow: ${fix}\n`)
  }

  process.exit(1)
}

function secret(): string {
  if (!existsSync(ENV_FILE)) {
    fail("no .env.local on this machine.", "Run once: bun run dev:prepare")
  }

  const held = parse(readFileSync(ENV_FILE, "utf8")).INTERNAL_WORKFLOW_SECRET

  return held || fail("INTERNAL_WORKFLOW_SECRET is empty in .env.local.")
}

async function main(): Promise<void> {
  const name = process.argv[2]

  if (!name) {
    fail(
      "no workflow named.",
      "Usage: bun run workflows:run <name> — the names are those in apps/web/src/workflows/registry.ts"
    )
  }

  const url = `${CONSOLE_URL}/internal/workflows/${name}`

  const answer = await fetch(url, {
    headers: { [SECRET_HEADER]: secret() },
    method: "POST",
  }).catch(() =>
    fail(
      `${CONSOLE_URL} did not respond.`,
      "Start the console: bun run dev:web"
    )
  )

  const body = (await answer.json().catch(() => null)) as {
    data?: { workflow: string; instance_id: string }
    error?: { message: string }
  } | null

  if (!answer.ok) {
    fail(
      `${name} refused (${answer.status}): ${body?.error?.message ?? "no message"}`
    )
  }

  process.stdout.write(
    `workflow: ${body?.data?.workflow ?? name} started, instance ${body?.data?.instance_id ?? "?"}\n`
  )
}

await main()
