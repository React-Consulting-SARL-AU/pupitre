import { describe, expect, it } from "bun:test";
import { shortcutSheet } from "../shortcut-sheet";

function keysOf(mac: boolean, group: string, name: string): string[] {
  return (
    shortcutSheet(mac)
      .find((one) => one.name === group)
      ?.shortcuts.find((one) => one.name === name)?.keys ?? []
  );
}

describe("la fiche des raccourcis", () => {
  it("écrit chaque raccourci avec les touches de la plateforme", () => {
    expect(keysOf(true, "project", "shell")).toEqual(["⌘T"]);
    expect(keysOf(false, "project", "shell")).toEqual(["Ctrl+T"]);
    expect(keysOf(true, "project", "tabByRank")).toEqual(["⌘⌥1", "⌘⌥7"]);
    expect(keysOf(false, "project", "tabByRank")).toEqual([
      "Ctrl+Alt+1",
      "Ctrl+Alt+7",
    ]);
    expect(keysOf(true, "terminal", "close")).toEqual(["⌘W"]);
    expect(keysOf(false, "terminal", "close")).toEqual(["Ctrl+Shift+W"]);
    expect(keysOf(true, "navigation", "back")).toEqual(["⌘["]);
    expect(keysOf(false, "navigation", "back")).toEqual(["Alt+←"]);
  });

  it("ne mentionne copier et coller que là où l'app les prend elle-même", () => {
    expect(keysOf(true, "terminal", "copy")).toEqual([]);
    expect(keysOf(false, "terminal", "copy")).toEqual(["Ctrl+Shift+C"]);
  });

  it("nomme chaque groupe et chaque raccourci par une clé du dictionnaire", () => {
    for (const group of shortcutSheet(true)) {
      expect(group.shortcuts.length).toBeGreaterThan(0);

      for (const shortcut of group.shortcuts) {
        expect(shortcut.keys.length).toBeGreaterThan(0);
      }
    }
  });
});
