/**
 * What the main process says about its work, as it crosses the bridge.
 *
 * An entry is already scrubbed when it leaves: anything carrying a secret's
 * name was replaced before the write. It serves debugging only — a packaged
 * build emits none.
 */
export interface TraceEntry {
  at: number;
  scope: string;
  event: string;
  detail?: Record<string, unknown>;
}
