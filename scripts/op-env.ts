import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const TEMPLATE = join(ROOT, ".env.1password.tpl")
const CONFIG_FILE = join(ROOT, "op.config.json")
const ENV_LINE_RE = /^([A-Z0-9_]+)=(.*)$/

interface OpConfig {
  vault?: string
  item?: string
}

function readConfig(): OpConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as OpConfig
  } catch {
    return {}
  }
}

function available(): boolean {
  return (
    spawnSync("op", ["--version"], { encoding: "utf8", env: process.env })
      .status === 0
  )
}

function unquote(value: string): string {
  const trimmed = value.trim()

  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed
}

/**
 * Résout les références `op://` du modèle. Rend null en expliquant pourquoi quand
 * `op` manque, que la session n'est pas ouverte ou qu'un champ est absent : le
 * démarrage retombe alors sur ce que `.env.local` porte déjà.
 */
export function loadOnePasswordEnv(): Record<string, string> | null {
  if (!existsSync(TEMPLATE)) {
    return null
  }

  if (!available()) {
    process.stdout.write(
      "1Password absent : `op` n'est pas installé. Les secrets partagés ne sont pas synchronisés.\n"
    )

    return null
  }

  const config = readConfig()
  const vault = process.env.OP_VAULT ?? config.vault
  const item = process.env.OP_ITEM ?? config.item

  if (!(vault && item)) {
    process.stdout.write(
      `1Password ignoré : renseigne « vault » et « item » dans ${CONFIG_FILE}, ou OP_VAULT et OP_ITEM.\n`
    )

    return null
  }

  const body = readFileSync(TEMPLATE, "utf8")
    .replaceAll("{{OP_VAULT}}", vault)
    .replaceAll("{{OP_ITEM}}", item)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim()

      return trimmed !== "" && !trimmed.startsWith("#")
    })
    .join("\n")

  const dir = mkdtempSync(join(tmpdir(), "pupitre-op-"))
  const path = join(dir, "env.tpl")

  writeFileSync(path, body)

  const injected = spawnSync("op", ["inject", "-i", path], {
    encoding: "utf8",
    env: process.env,
  })

  rmSync(dir, { force: true, recursive: true })

  if (injected.status !== 0) {
    const reason = injected.stderr?.trim() ?? "raison inconnue"

    process.stdout.write(
      `1Password ignoré : \`op inject\` a échoué. Ouvre une session avec \`op signin\`, ou commente la clé dont le champ manque.\n  ${reason}\n`
    )

    return null
  }

  const secrets: Record<string, string> = {}

  for (const raw of injected.stdout.split("\n")) {
    const line = raw.trim()

    if (line === "" || line.startsWith("#")) {
      continue
    }

    const found = line.match(ENV_LINE_RE)

    if (!found) {
      continue
    }

    const value = unquote(found[2])

    if (value !== "" && !value.includes("op://")) {
      secrets[found[1]] = value
    }
  }

  return Object.keys(secrets).length > 0 ? secrets : null
}
