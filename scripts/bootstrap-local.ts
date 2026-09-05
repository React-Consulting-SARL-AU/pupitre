import { execFileSync, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { loadOnePasswordEnv } from "./op-env"

const ROOT = join(import.meta.dir, "..")
const ENV_FILE = join(ROOT, ".env.local")
const ENV_SOURCE = join(ROOT, ".env.example")
const WRANGLER_FILE = join(ROOT, "apps/web/wrangler.jsonc")
const ENV_LINE_RE = /^([A-Z0-9_]+)=/

const NEON_PROJECT = process.env.PUPITRE_NEON_PROJECT ?? "pupitre"
const NEON_BRANCH = process.env.PUPITRE_NEON_BRANCH ?? "staging"

/** Propres au poste : une valeur tirée au hasard suffit, rien à partager. */
const GENERATED = ["BETTER_AUTH_SECRET", "INTERNAL_WORKFLOW_SECRET"] as const

/** Chaque outil lit l'environnement sous le nom qu'il attend, mais tous pointent
 * sur le même fichier : une seule valeur à tenir à jour. */
const LINKS = [
  { path: join(ROOT, "apps/web/.dev.vars"), label: "console (wrangler)" },
  { path: join(ROOT, "apps/web/.env.local"), label: "console (vite)" },
] as const

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

export function parse(content: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const raw of content.split("\n")) {
    const line = raw.trim()

    if (line === "" || line.startsWith("#")) {
      continue
    }

    const key = line.match(ENV_LINE_RE)?.[1]

    if (key) {
      const value = line.slice(key.length + 1).trim()

      values[key] = value.startsWith('"') ? value.slice(1, -1) : value
    }
  }

  return values
}

export function apply(content: string, values: Record<string, string>): string {
  const seen = new Set<string>()

  const lines = content.split("\n").map((line) => {
    const key = line.match(ENV_LINE_RE)?.[1]

    if (key && key in values) {
      seen.add(key)

      return `${key}=${quote(values[key])}`
    }

    return line
  })

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) {
      lines.push(`${key}=${quote(value)}`)
    }
  }

  return lines.join("\n")
}

export function stripJsonComments(content: string): string {
  let out = ""
  let inString = false
  let escaped = false
  let index = 0

  while (index < content.length) {
    const char = content[index]

    if (inString) {
      out += char
      inString = !(char === '"' && !escaped)
      escaped = char === "\\" && !escaped
      index += 1

      continue
    }

    if (char === '"') {
      inString = true
      out += char
      index += 1

      continue
    }

    if (char === "/" && content[index + 1] === "/") {
      const end = content.indexOf("\n", index)

      index = end === -1 ? content.length : end

      continue
    }

    if (char === "/" && content[index + 1] === "*") {
      const end = content.indexOf("*/", index + 2)

      index = end === -1 ? content.length : end + 2

      continue
    }

    out += char
    index += 1
  }

  return out
}

/**
 * Les valeurs non secrètes du développement vivent dans `vars` de
 * `apps/web/wrangler.jsonc`, mais `.dev.vars` masque `vars` clé par clé : sans
 * elles dans `.env.local`, le Worker local démarre avec `BETTER_AUTH_URL` vide.
 */
export function wranglerVars(path = WRANGLER_FILE): Record<string, string> {
  if (!existsSync(path)) {
    return {}
  }

  let parsed: { vars?: Record<string, unknown> }

  try {
    parsed = JSON.parse(stripJsonComments(readFileSync(path, "utf8")))
  } catch {
    process.stdout.write(
      `Valeurs locales ignorées : ${path} n'est pas lisible comme du JSONC.\n`
    )

    return {}
  }

  const values: Record<string, string> = {}

  for (const [key, value] of Object.entries(parsed.vars ?? {})) {
    if (typeof value === "string" && value !== "") {
      values[key] = value
    }
  }

  return values
}

export function localValues(
  current: Record<string, string>,
  defaults: Record<string, string> = wranglerVars()
): Record<string, string> {
  const values: Record<string, string> = {}

  for (const [key, value] of Object.entries(defaults)) {
    if (!current[key]) {
      values[key] = value
    }
  }

  return values
}

function neonctlReady(): boolean {
  return (
    spawnSync("neonctl", ["--version"], { encoding: "utf8" }).status === 0 &&
    spawnSync("neonctl", ["projects", "list", "--output", "json"], {
      encoding: "utf8",
    }).status === 0
  )
}

function neonProjectId(): string | null {
  const listed = execFileSync(
    "neonctl",
    ["projects", "list", "--output", "json"],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  )

  const parsed = JSON.parse(listed) as {
    projects?: { id: string; name: string }[]
  }

  const owned = parsed.projects ?? []

  return owned.find((project) => project.name === NEON_PROJECT)?.id ?? null
}

function connectionString(projectId: string, pooled: boolean): string {
  const command = [
    "connection-string",
    NEON_BRANCH,
    "--project-id",
    projectId,
    ...(pooled ? ["--pooled"] : []),
  ]

  return execFileSync("neonctl", command, { encoding: "utf8" }).trim()
}

function databaseUrls(): Record<string, string> {
  if (!neonctlReady()) {
    process.stdout.write(
      "Neon ignoré : `neonctl` est absent ou sans session. Lance `neonctl auth`, ou renseigne DATABASE_URL à la main.\n"
    )

    return {}
  }

  const projectId = neonProjectId()

  if (!projectId) {
    process.stdout.write(
      `Neon ignoré : aucun projet nommé « ${NEON_PROJECT} » sur ce compte.\n`
    )

    return {}
  }

  return {
    DATABASE_URL: connectionString(projectId, true),
    MIGRATE_DATABASE_URL: connectionString(projectId, false),
  }
}

/**
 * En local le secret de webhook est celui de l'endpoint que le CLI Stripe tient
 * pour ce compte : `stripe listen` signe avec lui, et il diffère de celui du
 * tableau de bord. Il se dérive donc, comme la base, au lieu d'être partagé.
 */
export function stripeWebhookSecret(
  run = (args: string[]) =>
    spawnSync("stripe", args, { encoding: "utf8" }) as {
      status: number | null
      stdout?: string
    }
): Record<string, string> {
  if (run(["--version"]).status !== 0) {
    process.stdout.write(
      "Stripe ignoré : le CLI `stripe` est absent. Installe-le, ou renseigne STRIPE_WEBHOOK_SECRET à la main.\n"
    )

    return {}
  }

  const printed = run(["listen", "--print-secret"])

  if (printed.status !== 0) {
    process.stdout.write(
      "Stripe ignoré : le CLI n'a pas de session. Lance `stripe login`.\n"
    )

    return {}
  }

  const secret = (printed.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .findLast((line) => line.startsWith("whsec_"))

  if (!secret) {
    process.stdout.write(
      "Stripe ignoré : `stripe listen --print-secret` n'a rendu aucun secret.\n"
    )

    return {}
  }

  return { STRIPE_WEBHOOK_SECRET: secret }
}

function link(target: string, path: string): void {
  if (existsSync(path) || lstatSync(path, { throwIfNoEntry: false })) {
    unlinkSync(path)
  }

  symlinkSync(target, path)
}

function main(): void {
  const base = existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, "utf8")
    : readFileSync(ENV_SOURCE, "utf8")

  const current = parse(base)
  const values: Record<string, string> = {}

  const shared = loadOnePasswordEnv()

  if (shared) {
    Object.assign(values, shared)
  }

  for (const key of GENERATED) {
    if (!current[key]) {
      values[key] = randomBytes(32).toString("base64url")
    }
  }

  const local = localValues({ ...current, ...values })

  Object.assign(values, local)

  if (!(current.DATABASE_URL && current.MIGRATE_DATABASE_URL)) {
    Object.assign(values, databaseUrls())
  }

  if (!current.STRIPE_WEBHOOK_SECRET) {
    Object.assign(values, stripeWebhookSecret())
  }

  writeFileSync(ENV_FILE, apply(base, values), { mode: 0o600 })
  chmodSync(ENV_FILE, 0o600)

  for (const { path } of LINKS) {
    link(ENV_FILE, path)
  }

  const counts = [
    shared ? `${Object.keys(shared).length} depuis 1Password` : null,
    GENERATED.filter((key) => key in values).length > 0
      ? `${GENERATED.filter((key) => key in values).length} tirés au hasard`
      : null,
    Object.keys(local).length > 0
      ? `${Object.keys(local).length} depuis wrangler.jsonc`
      : null,
    "DATABASE_URL" in values ? "base depuis Neon" : null,
    "STRIPE_WEBHOOK_SECRET" in values ? "webhook depuis Stripe" : null,
  ].filter(Boolean)

  process.stdout.write(
    `.env.local prêt${counts.length > 0 ? ` : ${counts.join(", ")}` : " : rien à changer"}\n`
  )
}

if (import.meta.main) {
  main()
}
