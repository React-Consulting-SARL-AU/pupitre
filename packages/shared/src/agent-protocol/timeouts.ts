import type { CommandName } from "./index"

/**
 * How long a command may take before the app stops waiting.
 *
 * They belong to the contract rather than to the client, because a screen has
 * to say more than "still going": past half of it, it tells the reader how long
 * this is allowed to take, and at the end it offers to read the state again
 * rather than to keep waiting on a channel nobody will answer.
 */

export const DEFAULT_TIMEOUT_MS = 60_000

/** A read the screens do on a timer: it answers or it does not, and waiting longer helps nobody. */
const QUICK_MS = 10_000

/** A step that installs, compiles or clones: half an hour is a package manager on a slow mirror. */
const LONG_MS = 1_800_000

/** A round trip to the platform, twice at most, each bounded by the agent at twenty seconds. */
const PLATFORM_MS = 60_000

/** A unit waits for systemd up to three minutes, and a tunnel then diagnoses for thirty seconds; the app outlasts both. */
const UNIT_MS = 240_000

export const COMMAND_TIMEOUTS_MS: Partial<Record<CommandName, number>> = {
  "agent.upgrade": LONG_MS,
  completions: QUICK_MS,
  "db.dump": LONG_MS,
  "db.import": LONG_MS,
  enroll: PLATFORM_MS,
  /** A folder answers on a keystroke. Reading, writing or deleting a file does not, and keeps the default minute. */
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
  /** A row rewritten, and a restart when the command changed: the minute holds. */
  "project.update": DEFAULT_TIMEOUT_MS,
  report: QUICK_MS,
  /** A read of the journal answers at once; a follow holds the channel as long as `project.logs` does, on the same default minute. */
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

/** When to start saying how long this is allowed to take. */
export function patienceOf(cmd: CommandName): number {
  return Math.round(timeoutOf(cmd) / 2)
}
