import type { AppUpdateState } from "@shared/app-update";

/**
 * The updater's state, as one value the window can read.
 *
 * electron-updater speaks in events; the About screen wants a status. This is
 * the fold from one to the other, without Electron, so it is tested by hand:
 * each event answers the next state from the one before.
 */

export type UpdaterEvent =
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "not-available" }
  | { kind: "progress"; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "refused"; version: string }
  | { kind: "error"; message: string };

export function initialUpdateState(updates: boolean): AppUpdateState {
  return { status: "idle", updates };
}

export function nextUpdateState(
  state: AppUpdateState,
  event: UpdaterEvent,
  now: () => string = () => new Date().toISOString()
): AppUpdateState {
  const base = { updates: state.updates };

  switch (event.kind) {
    case "checking":
      return { ...base, status: "checking" };
    case "available":
      return {
        ...base,
        checkedAt: now(),
        status: "available",
        version: event.version,
      };
    case "not-available":
      return { ...base, checkedAt: now(), status: "idle" };
    case "progress":
      return {
        ...base,
        ...(state.checkedAt ? { checkedAt: state.checkedAt } : {}),
        percent: Math.max(0, Math.min(100, Math.round(event.percent))),
        status: "downloading",
        ...(state.version ? { version: state.version } : {}),
      };
    case "downloaded":
      return {
        ...base,
        ...(state.checkedAt ? { checkedAt: state.checkedAt } : {}),
        status: "ready",
        version: event.version,
      };
    case "refused":
      return {
        ...base,
        error: `signature refused for ${event.version}`,
        status: "error",
        version: event.version,
      };
    default:
      return {
        ...base,
        ...(state.checkedAt ? { checkedAt: state.checkedAt } : {}),
        error: event.message,
        status: "error",
      };
  }
}
