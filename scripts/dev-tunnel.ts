import { spawn, spawnSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * The tunnel that publishes the local console under a stable name.
 *
 * A client's VPS has no way to reach `localhost:3000`: that is its own machine's
 * loopback. This tunnel gives the console served here an address the remote
 * server can join, and one that does not change from a launch to the next — a
 * named tunnel, not a throwaway one.
 *
 * Only `/api/v1/agent/` is served: the agent enrols, beats its heart and reads
 * versions through it. The console, Better Auth, the Stripe webhooks and the
 * whole rest of the development environment stay invisible from the internet.
 *
 * Nothing here exits in failure: a tunnel that cannot start says why and stops
 * alone. It has no business taking the development server down with it.
 */

const TUNNEL = process.env.PUPITRE_TUNNEL_NAME ?? "ppt-dev"
const HOSTNAME = process.env.PUPITRE_TUNNEL_HOSTNAME ?? "dev-app.pupitre.studio"
const SERVICE = process.env.PUPITRE_TUNNEL_SERVICE ?? "http://localhost:3000"

/** What the agent calls, and nothing else of the console. */
const AGENT_PATH = "^/api/v1/agent/"

const ROOT = join(import.meta.dir, "..")
const CONFIG = join(ROOT, "apps/web/.cloudflared.yml")
const HOME = join(homedir(), ".cloudflared")
const CERT = join(HOME, "cert.pem")

interface Listed {
  id: string
  name: string
}

interface Ran {
  status: number
  out: string
  log: string
}

function say(message: string): void {
  process.stdout.write(`tunnel: ${message}\n`)
}

/**
 * What is missing asks for an action, not a build failure: the message stays in
 * the tunnel's pane, and both Vite and Astro keep running.
 */
function give(message: string, fix?: string): never {
  say(message)

  if (fix) {
    say(fix)
  }

  process.exit(0)
}

/**
 * `cloudflared` writes its warnings on stderr, including when asked for JSON:
 * the two streams stay apart or the JSON becomes unreadable.
 */
function run(args: string[]): Ran {
  const result = spawnSync("cloudflared", args, { encoding: "utf8" })

  return {
    log: (result.stderr ?? "").trim(),
    out: (result.stdout ?? "").trim(),
    status: result.status ?? 1,
  }
}

function installed(): boolean {
  return spawnSync("which", ["cloudflared"], { stdio: "ignore" }).status === 0
}

function tunnelId(): string | null {
  const listed = run(["tunnel", "list", "--output", "json"])

  if (listed.status !== 0) {
    give(`cloudflared n'a pas pu lister les tunnels : ${listed.log}`)
  }

  try {
    const tunnels = JSON.parse(listed.out) as Listed[]

    return tunnels.find((tunnel) => tunnel.name === TUNNEL)?.id ?? null
  } catch {
    give(`liste de tunnels illisible : ${listed.out.slice(0, 200)}`)
  }
}

function created(): string {
  say(`création du tunnel ${TUNNEL}`)

  const made = run(["tunnel", "create", TUNNEL])

  if (made.status !== 0) {
    give(`création refusée : ${made.log || made.out}`)
  }

  return tunnelId() ?? give(`${TUNNEL} reste introuvable après sa création`)
}

/**
 * The DNS record, pointed at the tunnel this run actually serves.
 *
 * `--overwrite-dns` is what keeps the name honest. A record left behind by an
 * earlier tunnel — one renamed, one recreated on another machine — is otherwise
 * refused as already existing, and taking that refusal for a route in place
 * leaves the name on a tunnel nobody runs any more. The agent then reaches
 * Cloudflare, Cloudflare answers 1033 as a 530, and nothing in that says a word
 * about a DNS record.
 */
function routed(): void {
  const route = run([
    "tunnel",
    "route",
    "dns",
    "--overwrite-dns",
    TUNNEL,
    HOSTNAME,
  ])

  if (route.status !== 0) {
    give(`route DNS refusée : ${route.log || route.out}`)
  }

  say(`${HOSTNAME} pointe sur ${TUNNEL}`)
}

function writeConfig(id: string): void {
  writeFileSync(
    CONFIG,
    [
      "# Écrit par scripts/dev-tunnel.ts. Ne pas éditer : le fichier est régénéré.",
      `tunnel: ${id}`,
      `credentials-file: ${join(HOME, `${id}.json`)}`,
      "ingress:",
      `  - hostname: ${HOSTNAME}`,
      `    path: ${AGENT_PATH}`,
      `    service: ${SERVICE}`,
      "  - service: http_status:404",
      "",
    ].join("\n")
  )
}

function main(): void {
  if (!installed()) {
    give(
      "cloudflared est absent de cette machine.",
      "Installe-le : brew install cloudflared"
    )
  }

  if (!existsSync(CERT)) {
    give(
      "cloudflared n'a pas encore de certificat pour ce compte Cloudflare.",
      "Lance une fois : cloudflared tunnel login (choisis la zone pupitre.studio)"
    )
  }

  const id = tunnelId() ?? created()

  routed()
  writeConfig(id)
  say(`${HOSTNAME}/api/v1/agent/ → ${SERVICE}`)

  const child = spawn(
    "cloudflared",
    ["tunnel", "--config", CONFIG, "run", TUNNEL],
    { stdio: "inherit" }
  )

  child.on("exit", (code) => process.exit(code ?? 0))
}

try {
  main()
} catch (error) {
  give(`tunnel arrêté : ${error instanceof Error ? error.message : error}`)
}
