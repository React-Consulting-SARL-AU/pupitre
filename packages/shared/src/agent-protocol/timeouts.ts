import type { CommandName } from "./index"

// In the contract, not the client: past half of it, a screen tells the reader how long this may take.
export const DEFAULT_TIMEOUT_MS = 60_000

const QUICK_MS = 10_000

// A package manager on a slow mirror.
const LONG_MS = 1_800_000

// Two round trips at most, each bounded by the agent at twenty seconds.
const PLATFORM_MS = 60_000

// Systemd gets three minutes, then a tunnel diagnoses for thirty seconds; the app outlasts both.
const UNIT_MS = 240_000

export const COMMAND_TIMEOUTS_MS: Partial<Record<CommandName, number>> = {
  "agent.upgrade": LONG_MS,
  "backup.run": LONG_MS,
  "backup.status": QUICK_MS,
  "backup.restore.data": LONG_MS,
  "backup.restore.setup": LONG_MS,
  completions: QUICK_MS,
  "db.dump": LONG_MS,
  "db.import": LONG_MS,
  enroll: PLATFORM_MS,
  // Reading, writing or deleting a file keeps the default minute.
  "fs.list": QUICK_MS,
  "fs.mkdir": QUICK_MS,
  "fs.rename": QUICK_MS,
  "fs.stat": QUICK_MS,
  harden: LONG_MS,
  hello: QUICK_MS,
  install: LONG_MS,
  "keys.list": QUICK_MS,
  "keys.sync": PLATFORM_MS,
  "module.config": QUICK_MS,
  ping: QUICK_MS,
  "platform.sync": PLATFORM_MS,
  "project.add": LONG_MS,
  "project.detect": LONG_MS,
  "project.install": LONG_MS,
  "project.list": QUICK_MS,
  "project.pull": LONG_MS,
  "project.sync": LONG_MS,
  "project.update": DEFAULT_TIMEOUT_MS,
  report: QUICK_MS,
  // A follow holds the channel as long as `project.logs` does.
  "service.logs": DEFAULT_TIMEOUT_MS,
  "service.restart": UNIT_MS,
  "service.start": UNIT_MS,
  "service.status": QUICK_MS,
  "service.stop": UNIT_MS,
  snapshot: QUICK_MS,
  status: QUICK_MS,
  "tunnel.restart": UNIT_MS,
  "tunnel.sync": UNIT_MS,
  uninstall: LONG_MS,
  upgrade: LONG_MS,
}

export function timeoutOf(cmd: CommandName): number {
  return COMMAND_TIMEOUTS_MS[cmd] ?? DEFAULT_TIMEOUT_MS
}
