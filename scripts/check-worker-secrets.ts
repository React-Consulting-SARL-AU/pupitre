import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const DEFAULT_CONFIG = join(ROOT, "apps/web/wrangler.jsonc")

const WHITESPACE_RE = /\s/
const SEPARATOR_RE = /[\s,]+/

// Required only once the Worker actually bills: `BILLING_MODE=off` never reaches Stripe.
export const STRIPE_SECRETS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_SERVER_MONTH",
  "STRIPE_PRICE_SERVER_YEAR",
]

export interface TWorkerEnvironment {
  name?: string
  vars?: Record<string, unknown>
  secrets?: { required?: string[] }
}

export interface TWranglerConfig extends TWorkerEnvironment {
  env?: Record<string, TWorkerEnvironment>
}

export interface TEnvironmentSecrets {
  workerName: string
  required: string[]
  varNames: string[]
}

export interface TSecretReport {
  missing: string[]
  inPlainVars: string[]
}

export class WorkerSecretsError extends Error {}

function skipLineComment(source: string, from: number): number {
  let index = from

  while (index < source.length && source[index] !== "\n") {
    index += 1
  }

  return index
}

function skipBlockComment(source: string, from: number): number {
  let index = from + 2

  while (
    index < source.length &&
    !(source[index] === "*" && source[index + 1] === "/")
  ) {
    index += 1
  }

  return index + 2
}

function dropTrailingComma(out: string[]): void {
  while (out.length > 0 && WHITESPACE_RE.test(out.at(-1) ?? "")) {
    out.pop()
  }

  if (out.at(-1) === ",") {
    out.pop()
  }
}

function copyString(source: string, from: number, out: string[]): number {
  let index = from + 1
  out.push(source[from])

  while (index < source.length) {
    const char = source[index]

    if (char === "\\") {
      out.push(char, source[index + 1] ?? "")
      index += 2
      continue
    }

    out.push(char)
    index += 1

    if (char === '"') {
      break
    }
  }

  return index
}

export function stripJsonc(source: string): string {
  const out: string[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '"') {
      index = copyString(source, index, out)
      continue
    }

    if (char === "/" && next === "/") {
      index = skipLineComment(source, index)
      continue
    }

    if (char === "/" && next === "*") {
      index = skipBlockComment(source, index)
      continue
    }

    if (char === "}" || char === "]") {
      dropTrailingComma(out)
    }

    out.push(char)
    index += 1
  }

  return out.join("")
}

export function parseWranglerConfig(source: string): TWranglerConfig {
  return JSON.parse(stripJsonc(source)) as TWranglerConfig
}

export function readWranglerConfig(path: string): TWranglerConfig {
  if (!existsSync(path)) {
    throw new WorkerSecretsError(`Wrangler configuration not found: ${path}`)
  }

  return parseWranglerConfig(readFileSync(path, "utf8"))
}

export function environmentSecrets(
  config: TWranglerConfig,
  environment: string
): TEnvironmentSecrets {
  const environments = Object.keys(config.env ?? {})
  const block = config.env?.[environment]

  if (!block) {
    throw new WorkerSecretsError(
      `Unknown environment "${environment}". Declared environments: ${environments.join(", ") || "none"}.`
    )
  }

  const secrets = block.secrets ?? config.secrets
  const declared = secrets?.required ?? []
  const billing = block.vars?.BILLING_MODE === "stripe" ? STRIPE_SECRETS : []

  // Legacy environments, the mode the Vite plugin builds with: name + environment.
  return {
    workerName: `${config.name ?? "unknown"}-${environment}`,
    required: [...new Set([...declared, ...billing])],
    varNames: Object.keys(block.vars ?? {}),
  }
}

export function parseBoundNames(raw: string): string[] {
  const trimmed = raw.trim()

  if (trimmed.length === 0) {
    return []
  }

  try {
    return namesFromJson(JSON.parse(trimmed))
  } catch {
    return trimmed.split(SEPARATOR_RE).filter((name) => name.length > 0)
  }
}

function namesFromJson(payload: unknown): string[] {
  const list = Array.isArray(payload)
    ? payload
    : ((payload as { result?: unknown[] })?.result ?? [])

  return list
    .map((entry) =>
      typeof entry === "string" ? entry : (entry as { name?: string })?.name
    )
    .filter((name): name is string => typeof name === "string")
}

export function reportSecrets(
  secrets: TEnvironmentSecrets,
  bound: string[]
): TSecretReport {
  const boundSet = new Set(bound)
  const varSet = new Set(secrets.varNames)

  return {
    missing: secrets.required.filter(
      (name) => !(boundSet.has(name) || varSet.has(name))
    ),
    inPlainVars: secrets.required.filter((name) => varSet.has(name)),
  }
}

function boundSecretsFromWrangler(
  configPath: string,
  environment: string
): string[] {
  const result = spawnSync(
    "bun",
    [
      "x",
      "wrangler",
      "secret",
      "list",
      "--config",
      configPath,
      "--env",
      environment,
      "--format",
      "json",
    ],
    { encoding: "utf8" }
  )

  if (result.status !== 0) {
    throw new WorkerSecretsError(
      `\`wrangler secret list --env ${environment}\` failed:\n${result.stderr || result.stdout}`
    )
  }

  return parseBoundNames(result.stdout)
}

export function boundSecrets(
  configPath: string,
  environment: string,
  source: string | undefined
): string[] {
  if (source === "-") {
    return parseBoundNames(readFileSync(0, "utf8"))
  }

  if (source) {
    return parseBoundNames(readFileSync(source, "utf8"))
  }

  const injected = process.env.PUPITRE_WORKER_SECRETS

  if (injected !== undefined) {
    return parseBoundNames(injected)
  }

  return boundSecretsFromWrangler(configPath, environment)
}

interface TArguments {
  environment: string
  configPath: string
  boundFrom?: string
}

export function parseArguments(argv: string[]): TArguments {
  let environment = ""
  let configPath = DEFAULT_CONFIG
  let boundFrom: string | undefined

  const queue = [...argv]

  while (queue.length > 0) {
    const argument = queue.shift() ?? ""

    if (argument === "--config") {
      configPath = queue.shift() ?? ""
      continue
    }

    if (argument === "--bound-from") {
      boundFrom = queue.shift()
      continue
    }

    if (argument.startsWith("--")) {
      throw new WorkerSecretsError(`Unknown option: ${argument}`)
    }

    environment = argument
  }

  if (!environment) {
    throw new WorkerSecretsError(
      "Usage: bun scripts/check-worker-secrets.ts <environment> [--config <wrangler.jsonc>] [--bound-from <file|->]"
    )
  }

  return { environment, configPath, boundFrom }
}

function describe(
  report: TSecretReport,
  secrets: TEnvironmentSecrets,
  environment: string
): string {
  const lines = [`Deployment refused: ${secrets.workerName} is not ready.`]

  if (report.missing.length > 0) {
    lines.push(
      `${report.missing.length} required secret(s) are not set on the Worker:`
    )
    lines.push(...report.missing.map((name) => `- ${name}`))
  }

  for (const name of report.inPlainVars) {
    lines.push(
      `- ${name} is declared in \`vars\`, in clear text: move it to a Wrangler secret.`
    )
  }

  lines.push(
    `Set each one with \`bun x wrangler secret put <NAME> --config apps/web/wrangler.jsonc --env ${environment}\`, never in the repository.`
  )

  return `${lines.join("\n")}\n`
}

export function main(argv: string[]): number {
  try {
    const { environment, configPath, boundFrom } = parseArguments(argv)
    const secrets = environmentSecrets(
      readWranglerConfig(configPath),
      environment
    )
    const report = reportSecrets(
      secrets,
      boundSecrets(configPath, environment, boundFrom)
    )

    if (report.missing.length > 0 || report.inPlainVars.length > 0) {
      process.stderr.write(describe(report, secrets, environment))

      return 1
    }

    process.stdout.write(
      `${secrets.workerName}: ${secrets.required.length} required secrets are all set.\n`
    )

    return 0
  } catch (error) {
    if (!(error instanceof WorkerSecretsError)) {
      throw error
    }

    process.stderr.write(`${error.message}\n`)

    return 1
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)))
}
