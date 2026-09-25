import type { TraceEntry } from "@shared/trace";

function detailOf(entry: TraceEntry): Record<string, unknown> {
  return entry.detail ?? {};
}

/** Replays the main process's trace here, so both sides of the bridge read in one order. */
export function watchTrace(): () => void {
  return window.pupitre.onTrace((entry) => {
    console.debug(`[${entry.scope}] ${entry.event}`, detailOf(entry));
  });
}
