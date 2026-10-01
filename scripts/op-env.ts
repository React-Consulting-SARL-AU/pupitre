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
import {
  CONFIG_FILE,
  environmentOf,
  LOCAL_ENVIRONMENT,
  readEnvironments,
} from "./environments"

const ROOT = join(import.meta.dir, "..")
const TEMPLATE = join(ROOT, ".env.1password.tpl")
const ENV_LINE_RE = /^([A-Z0-9_]+)=(.*)$/

function localNote(): { vault?: string; item?: string } {
  try {
    const config = readEnvironments()

    return {
      item: environmentOf(LOCAL_ENVIRONMENT, config).item,
      vault: config.vault,
    }
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

/** Null, with the reason printed, when `op` cannot answer: startup keeps `.env.local` as is. */
export function loadOnePasswordEnv(): Record<string, string> | null {
  if (!existsSync(TEMPLATE)) {
    return null
  }

  if (!available()) {
    process.stdout.write(
      "1Password missing: `op` is not installed. The shared secrets are not synchronised.\n"
    )

    return null
  }

  const note = localNote()
  const vault = process.env.OP_VAULT ?? note.vault
  const item = process.env.OP_ITEM ?? note.item

  if (!(vault && item)) {
    process.stdout.write(
      `1Password skipped: set "vault" and "item" for ${LOCAL_ENVIRONMENT} in ${CONFIG_FILE}, or OP_VAULT and OP_ITEM.\n`
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
      `1Password skipped: \`op inject\` failed. Sign in with \`op signin\`, or comment out the key whose field is missing.\n  ${reason}\n`
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
