import { spawnSync } from "node:child_process"

const script = process.argv[2]

if (!script) {
  console.error("Usage : bun scripts/on-workers-ci.ts <script du package.json>")
  process.exit(1)
}

if (process.env.WORKERS_CI !== "1") {
  console.log(`Hors Workers Builds : « ${script} » n'est pas lancé.`)
  process.exit(0)
}

const result = spawnSync(process.execPath, ["run", script], {
  stdio: "inherit",
})

process.exit(result.status ?? 1)
