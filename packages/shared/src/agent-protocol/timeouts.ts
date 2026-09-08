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

export const COMMAND_TIMEOUTS_MS: Partial<Record<CommandName, number>> = {
  "agent.upgrade": LONG_MS,
  completions: QUICK_MS,
  "db.dump": LONG_MS,
  "db.import": LONG_MS,
  harden: LONG_MS,
  hello: QUICK_MS,
  install: LONG_MS,
  "keys.list": QUICK_MS,
  "module.config": QUICK_MS,
  ping: QUICK_MS,
  "project.add": LONG_MS,
  "project.detect": LONG_MS,
  "project.install": LONG_MS,
  "project.list": QUICK_MS,
  "project.sync": LONG_MS,
  report: QUICK_MS,
  "secrets.status": QUICK_MS,
  "service.status": QUICK_MS,
  snapshot: QUICK_MS,
  status: QUICK_MS,
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
