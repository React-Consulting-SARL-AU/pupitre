import { describe, expect, it } from "bun:test";
import { shortcutSheet } from "../shortcut-sheet";

function keysOf(mac: boolean, group: string, name: string): string[] {
  return (
    shortcutSheet(mac)
      .find((one) => one.name === group)
      ?.shortcuts.find((one) => one.name === name)?.keys ?? []
  );
}

describe("the shortcut sheet", () => {
  it("writes each shortcut with the platform's keys", () => {
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

  it("mentions copy and paste only where the app handles them itself", () => {
    expect(keysOf(true, "terminal", "copy")).toEqual([]);
    expect(keysOf(false, "terminal", "copy")).toEqual(["Ctrl+Shift+C"]);
  });

  it("names each group and each shortcut by a dictionary key", () => {
    for (const group of shortcutSheet(true)) {
      expect(group.shortcuts.length).toBeGreaterThan(0);

      for (const shortcut of group.shortcuts) {
        expect(shortcut.keys.length).toBeGreaterThan(0);
      }
    }
  });
});
