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
  { hint: "online", id: "flymate-api", kind: "project", label: "flymate-api" },
  { hint: "flymate-api", id: "t1", kind: "terminal", label: "Claude" },
  { hint: "203.0.113.9", id: "srv-2", kind: "server", label: "Bureau" },
];

describe("la palette", () => {
  it("s'ouvre sur commande K sur macOS, contrôle K ailleurs", () => {
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

  it("garde tout sans terme, dans l'ordre donné", () => {
    expect(filterEntries(ENTRIES, "  ")).toEqual(ENTRIES);
  });

  it("filtre à la frappe, ce qui commence par le terme d'abord, puis ce que l'indice porte", () => {
    expect(filterEntries(ENTRIES, "fly").map((one) => one.id)).toEqual([
      "flymate-api",
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

  it("se parcourt aux flèches en bouclant", () => {
    expect(stepSelection(0, 3, "ArrowDown")).toBe(1);
    expect(stepSelection(2, 3, "ArrowDown")).toBe(0);
    expect(stepSelection(0, 3, "ArrowUp")).toBe(2);
    expect(stepSelection(1, 3, "End")).toBe(2);
    expect(stepSelection(2, 3, "Home")).toBe(0);
    expect(stepSelection(1, 3, "a")).toBe(1);
    expect(stepSelection(0, 0, "ArrowDown")).toBe(0);
  });
});

describe("les touches qu'un terminal garde pour lui", () => {
  const inside = (found: boolean) => ({
    closest: (selector: string) =>
      found && selector.includes("tablist") ? {} : null,
  });

  it("couvrent le terminal et sa barre d'onglets, et rien d'autre", () => {
    expect(claimedByTerminal(inside(true))).toBe(true);
    expect(claimedByTerminal(inside(false))).toBe(false);
    expect(claimedByTerminal(null)).toBe(false);
    expect(claimedByTerminal({})).toBe(false);
  });
});
