/** Already scrubbed of anything named like a secret; a packaged build emits none. */
export interface TraceEntry {
  at: number;
  scope: string;
  event: string;
  detail?: Record<string, unknown>;
}
