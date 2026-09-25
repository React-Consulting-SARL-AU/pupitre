import type { KeyChord } from "./terminal-shortcuts";

export type ProjectShortcut =
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "tab"; index: number };

/** `code` is needed because option turns a digit into a symbol on macOS. */
export interface ProjectKeyChord extends KeyChord {
  code: string;
}

const DIGIT_CODE = /^Digit([1-9])$/;

export function projectChordLabel(mac: boolean): string {
  return mac ? "⌘⌥" : "Ctrl+Alt+";
}

export function agentChordLabel(mac: boolean): string {
  return mac ? "⌘⇧T" : "Ctrl+Shift+T";
}

/** No shell nor terminal shortcut claims this modifier pair, so it also works inside a session. */
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
