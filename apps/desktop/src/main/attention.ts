import type { AgentState } from "@shared/terminals";

/**
 * The sessions that wait for the reader, counted and told.
 *
 * `terminals.ts` reads the pipes and says what each session is doing every
 * few hundred milliseconds; what is decided here is what that means outside
 * the window — how many wait, on the Dock badge, and which one just started
 * waiting while the reader was looking elsewhere, in a notification. Nothing
 * here touches Electron, so the arithmetic is tested without it.
 */

export type States = Record<string, AgentState>;

export function waitingIn(states: States): string[] {
  return Object.entries(states)
    .filter(([, state]) => state === "attention")
    .map(([id]) => id);
}

/** The sessions that turned to waiting between two readings. */
export function newlyWaiting(previous: States, next: States): string[] {
  return waitingIn(next).filter((id) => previous[id] !== "attention");
}

export interface AttentionDeps {
  /** Paints the count where the system shows it: the Dock, the taskbar. */
  badge: (count: number) => void;
  /** Whether the window is in front: a reader looking at it needs no notification. */
  focused: () => boolean;
  /** Whether the reader allowed notifications at all. */
  allowed: () => boolean;
  /** Posts one, for the session named. */
  notify: (id: string) => void;
}

/**
 * The listener `onStates` takes: it keeps the last reading and acts on the
 * difference, so a session that keeps waiting is announced once.
 */
export function attentionWatcher(
  deps: AttentionDeps
): (states: States) => void {
  let previous: States = {};

  return (states) => {
    const waiting = waitingIn(states);

    deps.badge(waiting.length);

    if (deps.allowed() && !deps.focused()) {
      for (const id of newlyWaiting(previous, states)) {
        deps.notify(id);
      }
    }

    previous = states;
  };
}
