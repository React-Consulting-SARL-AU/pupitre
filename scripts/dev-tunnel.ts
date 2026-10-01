import { spawn, spawnSync } from "node:child_process"

// A token names one dashboard-managed tunnel; `cloudflared tunnel login` would bind the whole machine.
const TOKEN = process.env.PUPITRE_TUNNEL_TOKEN
const HOSTNAME = process.env.PUPITRE_TUNNEL_HOSTNAME ?? "dev.pupitre.studio"

function say(message: string): void {
  process.stdout.write(`tunnel: ${message}\n`)
}

// Exits cleanly so a missing tunnel never takes the dev servers down with it.
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
      "skipped: cloudflared is not installed on this machine.",
      "Only needed to let a remote agent reach this console: brew install cloudflared"
    )
  }

  if (!TOKEN) {
    give(
      "skipped: PUPITRE_TUNNEL_TOKEN is empty, so the tunnel cannot identify itself.",
      "Only needed to let a remote agent reach this console; maintainers get the token from 1Password through bun run dev:prepare."
    )
  }

  say(`${HOSTNAME} → this console, on /api/v1/agent/ only`)

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
  give(`stopped: ${error instanceof Error ? error.message : error}`)
}
