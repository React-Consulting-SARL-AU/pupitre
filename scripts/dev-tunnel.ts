import { spawn, spawnSync } from "node:child_process"

/**
 * The tunnel that publishes the local console under a stable name.
 *
 * A client's VPS has no way to reach `localhost:3000`: that is its own machine's
 * loopback. This tunnel gives the console served here an address the remote
 * server can join, and one that does not change from a launch to the next.
 *
 * The tunnel is managed from the Cloudflare dashboard, and runs from its token:
 * the hostname, the `^/api/v1/agent/` path it serves and the origin it forwards
 * to live there, and nothing else of the console is exposed. A token names one
 * tunnel and nothing more, where `cloudflared tunnel login` binds the whole
 * machine to one account — unusable with several projects on several tunnels.
 *
 * Nothing here exits in failure: a tunnel that cannot start says why and stops
 * alone. It has no business taking the development server down with it.
 */

const TOKEN = process.env.PUPITRE_TUNNEL_TOKEN
const HOSTNAME = process.env.PUPITRE_TUNNEL_HOSTNAME ?? "dev.pupitre.studio"

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

function installed(): boolean {
  return spawnSync("which", ["cloudflared"], { stdio: "ignore" }).status === 0
}

function main(): void {
  if (!installed()) {
    give(
      "cloudflared est absent de cette machine.",
      "Installe-le : brew install cloudflared"
    )
  }

  if (!TOKEN) {
    give(
      "PUPITRE_TUNNEL_TOKEN est vide : le tunnel ne peut pas s'identifier.",
      "Pose le jeton du tunnel dans la note 1Password du poste, puis relance bun run dev:prepare"
    )
  }

  say(`${HOSTNAME} → cette console, sur /api/v1/agent/ seulement`)

  // The token goes through the environment: as an argument it would sit in every `ps`.
  const child = spawn("cloudflared", ["tunnel", "run"], {
    env: { ...process.env, TUNNEL_TOKEN: TOKEN },
    stdio: "inherit",
  })

  child.on("exit", (code) => process.exit(code ?? 0))
}

try {
  main()
} catch (error) {
  give(`tunnel arrêté : ${error instanceof Error ? error.message : error}`)
}
