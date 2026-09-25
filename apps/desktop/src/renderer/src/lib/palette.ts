import type { KeyChord } from "./terminal-shortcuts";

export type PaletteKind = "view" | "project" | "terminal" | "server";

export interface PaletteEntry {
  id: string;
  kind: PaletteKind;
  label: string;
  hint?: string;
}

export function paletteChordOf(event: KeyChord, mac: boolean): boolean {
  if (event.type !== "keydown" || event.altKey || event.shiftKey) {
    return false;
  }

  const chord = mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;

  return chord && event.key.toLowerCase() === "k";
}

export function paletteChordLabel(mac: boolean): string {
  return mac ? "⌘K" : "Ctrl+K";
}

function rankOf(entry: PaletteEntry, term: string): number {
  const label = entry.label.toLowerCase();

  if (label.startsWith(term)) {
    return 0;
  }

  if (label.includes(term)) {
    return 1;
  }

  return entry.hint?.toLowerCase().includes(term) ? 2 : -1;
}

export function filterEntries(
  entries: readonly PaletteEntry[],
  term: string
): PaletteEntry[] {
  const wanted = term.trim().toLowerCase();

  if (wanted === "") {
    return [...entries];
  }

  return entries
    .map((entry, index) => ({ entry, index, rank: rankOf(entry, wanted) }))
    .filter((one) => one.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((one) => one.entry);
}

export function stepSelection(
  index: number,
  count: number,
  key: string
): number {
  if (count === 0) {
    return 0;
  }

  if (key === "ArrowDown") {
    return (index + 1) % count;
  }

  if (key === "ArrowUp") {
    return (index - 1 + count) % count;
  }

  if (key === "Home") {
    return 0;
  }

  return key === "End" ? count - 1 : index;
}
