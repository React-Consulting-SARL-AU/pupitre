import { useSyncExternalStore } from "react";

/**
 * What a living terminal says about itself, for the bar under it.
 *
 * xterm is outside React, and so is this: the registry writes here as the
 * session resizes, scrolls and announces its folder, and the bar reads it
 * through a subscription rather than through a store that would be rewritten
 * on every keystroke.
 */
export interface TerminalStatus {
  cols: number;
  rows: number;
  /** The last line is in view: nothing has scrolled out of sight below. */
  atBottom: boolean;
  /** The folder the shell announced, when it announces one. */
  dir: string | null;
  /** Where the open search stands, when one is open. */
  matches: { index: number; count: number } | null;
}

export const UNKNOWN_STATUS: TerminalStatus = {
  atBottom: true,
  cols: 0,
  rows: 0,
  dir: null,
  matches: null,
};

const held = new Map<string, TerminalStatus>();
const listeners = new Map<string, Set<() => void>>();

function same(a: TerminalStatus, b: TerminalStatus): boolean {
  return (
    a.cols === b.cols &&
    a.rows === b.rows &&
    a.atBottom === b.atBottom &&
    a.dir === b.dir &&
    a.matches?.index === b.matches?.index &&
    a.matches?.count === b.matches?.count
  );
}

function notify(id: string): void {
  for (const callback of listeners.get(id) ?? []) {
    callback();
  }
}

export function noteStatus(id: string, patch: Partial<TerminalStatus>): void {
  const before = held.get(id) ?? UNKNOWN_STATUS;
  const next = { ...before, ...patch };

  if (same(before, next)) {
    return;
  }

  held.set(id, next);
  notify(id);
}

export function forgetStatus(id: string): void {
  if (held.delete(id)) {
    notify(id);
  }
}

export function statusOf(id: string): TerminalStatus {
  return held.get(id) ?? UNKNOWN_STATUS;
}

function subscribe(id: string, callback: () => void): () => void {
  let list = listeners.get(id);

  if (!list) {
    list = new Set();
    listeners.set(id, list);
  }

  list.add(callback);

  return () => {
    list.delete(callback);

    if (list.size === 0) {
      listeners.delete(id);
    }
  };
}

export function useTerminalStatus(id: string): TerminalStatus {
  return useSyncExternalStore(
    (callback) => subscribe(id, callback),
    () => statusOf(id),
    () => statusOf(id)
  );
}
