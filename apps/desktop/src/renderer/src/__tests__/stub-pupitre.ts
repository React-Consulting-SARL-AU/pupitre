import { NO_CONNECTIONS } from "@shared/connections";
import type { PupitreApi } from "../../../preload";

// Calls a step fires on its own when entered, stubbed so a test only replaces the ones it looks at.
const QUIET: Partial<PupitreApi> = {
  checkInstall: () =>
    Promise.resolve({ ok: true, result: { problems: [], warnings: [] } }),
  closeTerminal: () => undefined,
  connectionsState: () => Promise.resolve(NO_CONNECTIONS),
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
  sudoPasswordState: () => Promise.resolve({ held: false, kept: false }),
  syncPlatform: () =>
    Promise.resolve({
      error: { code: "internal", message: "no platform in this test" },
      ok: false,
    }),
};

// A poll is the same command on another channel, which no store can tell apart.
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
