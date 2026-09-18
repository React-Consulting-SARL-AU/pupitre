import type { KeyChord } from "./terminal-shortcuts";

export type ProjectShortcut =
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "tab"; index: number };

/** The chord plus the physical key: option turns a digit into a symbol on macOS. */
export interface ProjectKeyChord extends KeyChord {
  code: string;
}

const DIGIT_CODE = /^Digit([1-9])$/;

/** The label a tooltip prints before the key, on this platform. */
export function projectChordLabel(mac: boolean): string {
  return mac ? "⌘⌥" : "Ctrl+Alt+";
}

/** The menu's chord for a new agent session, as the system draws it. */
export function agentChordLabel(mac: boolean): string {
  return mac ? "⌘⇧T" : "Ctrl+Shift+T";
}

/**
 * The keys that walk the tabs of a project page.
 *
 * Command with option on macOS, control with alt elsewhere: the one modifier
 * no shell and no terminal shortcut of the app claims, so the same chord
 * works from inside a session as from the page around it. The arrows step
 * to the neighbour tab, a digit jumps to the tab of that rank.
 */
export function projectShortcutOf(
  event: ProjectKeyChord,
  mac: boolean
): ProjectShortcut | null {
  if (event.type !== "keydown" || event.shiftKey || !event.altKey) {
    return null;
  }

  const chord = mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;

  if (!chord) {
    return null;
  }

  if (event.key === "ArrowRight") {
    return { kind: "next" };
  }

  if (event.key === "ArrowLeft") {
    return { kind: "previous" };
  }

  const digit = DIGIT_CODE.exec(event.code)?.[1];

  return digit ? { index: Number(digit) - 1, kind: "tab" } : null;
}

/** The tab the shortcut lands on, wrapping at both ends; none past the last rank. */
export function tabAfter<T>(
  tabs: readonly T[],
  active: T,
  shortcut: ProjectShortcut
): T | null {
  if (shortcut.kind === "tab") {
    return tabs[shortcut.index] ?? null;
  }

  const index = tabs.indexOf(active);

  if (index === -1) {
    return tabs[0] ?? null;
  }

  const step = shortcut.kind === "next" ? 1 : -1;

  return tabs[(index + step + tabs.length) % tabs.length] ?? null;
}
