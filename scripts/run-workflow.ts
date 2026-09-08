import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "./bootstrap-local"

/**
 * Un workflow lancé à la main, sur la console de cet ordinateur.
 *
 * En production les cinq workflows partent de Cron Triggers, qui ne se
 * déclenchent que sur un Worker déployé : en local, rien ne les appelle jamais.
 * Une ligne révoquée n'y est donc jamais décommissionnée, et tout ce qui dépend
 * d'une échéance reste intestable. Ce script frappe le même déclencheur interne
 * que la CI, avec le secret que `dev:prepare` a écrit.
 *
 * Les noms sont ceux de `apps/web/src/workflows/registry.ts` ; c'est le Worker
 * qui refuse un nom inconnu, pas ce script, pour qu'il n'y ait qu'une liste.
 */

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
    fail(
      "aucun .env.local sur ce poste.",
      "Lance une fois : bun run dev:prepare"
    )
  }

  const held = parse(readFileSync(ENV_FILE, "utf8")).INTERNAL_WORKFLOW_SECRET

  return held || fail("INTERNAL_WORKFLOW_SECRET est vide dans .env.local.")
}

async function main(): Promise<void> {
  const name = process.argv[2]

  if (!name) {
    fail(
      "aucun workflow nommé.",
      "Usage : bun run workflows:run <nom> — les noms sont ceux de apps/web/src/workflows/registry.ts"
    )
  }

  const url = `${CONSOLE_URL}/internal/workflows/${name}`

  const answer = await fetch(url, {
    headers: { [SECRET_HEADER]: secret() },
    method: "POST",
  }).catch(() =>
    fail(
      `${CONSOLE_URL} n'a pas répondu.`,
      "Lance la console : bun run dev:web"
    )
  )

  const body = (await answer.json().catch(() => null)) as {
    data?: { workflow: string; instance_id: string }
    error?: { message: string }
  } | null

  if (!answer.ok) {
    fail(
      `${name} refusé (${answer.status}) : ${body?.error?.message ?? "sans message"}`
    )
  }

  process.stdout.write(
    `workflow: ${body?.data?.workflow ?? name} lancé, instance ${body?.data?.instance_id ?? "?"}\n`
  )
}

await main()
