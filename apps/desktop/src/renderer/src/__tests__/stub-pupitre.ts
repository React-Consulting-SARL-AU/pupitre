import type { PupitreApi } from "../../../preload";

/**
 * A `window.pupitre` for the length of a test.
 *
 * The stores are never tested against a real agent: what matters here is what
 * they do with the envelope, and an envelope is cheaper to write than a server.
 *
 * The calls below are the ones a step fires on its own — the machine acts when
 * a step is entered, so a test that walks past the agent or the hardening would
 * otherwise have to stub two commands it is not looking at. They answer nothing
 * and change nothing; a test that cares about one of them replaces it.
 */
const QUIET: Partial<PupitreApi> = {
  closeTerminal: () => undefined,
  connectionsState: () =>
    Promise.resolve({
      "1password": { status: "absent" },
      cloudflare: { status: "absent" },
      github: { status: "absent" },
      neon: { status: "absent" },
      wrangler: { status: "absent" },
    }),
  devDefaults: () => Promise.resolve(null),
  fleet: () =>
    Promise.resolve({
      error: { code: "internal", message: "no platform in this test" },
      ok: false,
    }),
  harden: () =>
    Promise.resolve({
      error: { code: "internal", message: "no agent in this test" },
      ok: false,
    }),
  inspect: () =>
    Promise.resolve({
      error: { code: "internal", message: "no agent in this test" },
      ok: false,
    }),
  sendAgent: () =>
    Promise.resolve({
      error: { code: "internal", message: "no agent in this test" },
      ok: false,
    }),
  startInstall: () =>
    Promise.resolve({
      error: { code: "internal", message: "no agent in this test" },
      ok: false,
    }),
  syncPlatform: () =>
    Promise.resolve({
      error: { code: "internal", message: "no platform in this test" },
      ok: false,
    }),
};

/** A poll is the same command on another channel, which no store can tell apart. */
function polling(partial: Partial<PupitreApi>): Partial<PupitreApi> {
  return partial.agentCall && !partial.agentPoll
    ? { agentPoll: partial.agentCall }
    : {};
}

export function stubPupitre(partial: Partial<PupitreApi>): void {
  (globalThis as { window?: unknown }).window ??= globalThis;
  (globalThis as unknown as { window: { pupitre: unknown } }).window.pupitre = {
    ...QUIET,
    ...polling(partial),
    ...partial,
  } as PupitreApi;
}
