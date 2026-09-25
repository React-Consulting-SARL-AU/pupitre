import type { AgentState } from "@shared/terminals";

export type States = Record<string, AgentState>;

export function waitingIn(states: States): string[] {
  return Object.entries(states)
    .filter(([, state]) => state === "attention")
    .map(([id]) => id);
}

export function newlyWaiting(previous: States, next: States): string[] {
  return waitingIn(next).filter((id) => previous[id] !== "attention");
}

export interface AttentionDeps {
  badge: (count: number) => void;
  /** A reader looking at the window needs no notification. */
  focused: () => boolean;
  allowed: () => boolean;
  notify: (id: string) => void;
}

/** Acts on the difference with the last reading, so a session that keeps waiting is announced once. */
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
