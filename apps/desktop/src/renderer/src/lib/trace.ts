import type { TraceEntry } from "@shared/trace";

/**
 * What the main process does, replayed in the window's console.
 *
 * Debugging an enrollment happens on both sides of the bridge — an `ssh` that
 * refuses on one side, a screen that waits on the other — and reading them in
 * two places loses the order of things. A packaged build emits nothing: the
 * trace is off in the main process there, and this listener never receives
 * anything.
 */

function detailOf(entry: TraceEntry): Record<string, unknown> {
  return entry.detail ?? {};
}

export function watchTrace(): () => void {
  return window.pupitre.onTrace((entry) => {
    console.debug(`[${entry.scope}] ${entry.event}`, detailOf(entry));
  });
}
