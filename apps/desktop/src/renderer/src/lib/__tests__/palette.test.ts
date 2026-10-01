import { describe, expect, it } from "bun:test";
import { claimedByTerminal } from "../history-shortcuts";
import {
  filterEntries,
  type PaletteEntry,
  paletteChordLabel,
  paletteChordOf,
  stepSelection,
} from "../palette";
import type { KeyChord } from "../terminal-shortcuts";

function chord(key: string, held: Partial<KeyChord> = {}): KeyChord {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    type: "keydown",
    ...held,
  };
}

const ENTRIES: PaletteEntry[] = [
  { id: "dashboard", kind: "view", label: "Tableau de bord" },
  { id: "services", kind: "view", label: "Services" },
  { hint: "online", id: "flyleaf-api", kind: "project", label: "flyleaf-api" },
  { hint: "flyleaf-api", id: "t1", kind: "terminal", label: "Claude" },
  { hint: "203.0.113.9", id: "srv-2", kind: "server", label: "Bureau" },
];

describe("the palette", () => {
  it("opens on command K on macOS, control K elsewhere", () => {
    expect(paletteChordOf(chord("k", { metaKey: true }), true)).toBe(true);
    expect(paletteChordOf(chord("K", { ctrlKey: true }), false)).toBe(true);
    expect(paletteChordOf(chord("k", { ctrlKey: true }), true)).toBe(false);
    expect(paletteChordOf(chord("k", { metaKey: true }), false)).toBe(false);
    expect(
      paletteChordOf(chord("k", { metaKey: true, shiftKey: true }), true)
    ).toBe(false);
    expect(
      paletteChordOf(chord("k", { metaKey: true, type: "keyup" }), true)
    ).toBe(false);
    expect(paletteChordLabel(true)).toBe("⌘K");
    expect(paletteChordLabel(false)).toBe("Ctrl+K");
  });

  it("keeps everything without a term, in the given order", () => {
    expect(filterEntries(ENTRIES, "  ")).toEqual(ENTRIES);
  });

  it("filters as you type, what starts with the term first, then what the hint carries", () => {
    expect(filterEntries(ENTRIES, "fly").map((one) => one.id)).toEqual([
      "flyleaf-api",
      "t1",
    ]);
    expect(filterEntries(ENTRIES, "ERVI").map((one) => one.id)).toEqual([
      "services",
    ]);
    expect(filterEntries(ENTRIES, "113").map((one) => one.id)).toEqual([
      "srv-2",
    ]);
    expect(filterEntries(ENTRIES, "zzz")).toEqual([]);
  });

  it("moves with the arrow keys, wrapping around", () => {
    expect(stepSelection(0, 3, "ArrowDown")).toBe(1);
    expect(stepSelection(2, 3, "ArrowDown")).toBe(0);
    expect(stepSelection(0, 3, "ArrowUp")).toBe(2);
    expect(stepSelection(1, 3, "End")).toBe(2);
    expect(stepSelection(2, 3, "Home")).toBe(0);
    expect(stepSelection(1, 3, "a")).toBe(1);
    expect(stepSelection(0, 0, "ArrowDown")).toBe(0);
  });
});

describe("the keys a terminal keeps for itself", () => {
  const inside = (found: boolean) => ({
    closest: (selector: string) =>
      found && selector.includes("tablist") ? {} : null,
  });

  it("cover the terminal and its tab bar, and nothing else", () => {
    expect(claimedByTerminal(inside(true))).toBe(true);
    expect(claimedByTerminal(inside(false))).toBe(false);
    expect(claimedByTerminal(null)).toBe(false);
    expect(claimedByTerminal({})).toBe(false);
  });
});
