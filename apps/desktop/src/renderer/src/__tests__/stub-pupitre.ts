import type { PupitreApi } from "../../../preload";

/**
 * A `window.pupitre` for the length of a test.
 *
 * The stores are never tested against a real agent: what matters here is what
 * they do with the envelope, and an envelope is cheaper to write than a server.
 */
export function stubPupitre(partial: Partial<PupitreApi>): void {
  (globalThis as { window?: unknown }).window ??= globalThis;
  (globalThis as unknown as { window: { pupitre: unknown } }).window.pupitre =
    partial as PupitreApi;
}
