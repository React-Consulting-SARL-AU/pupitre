import { describe, expect, it } from "bun:test";
import {
  type ProjectKeyChord,
  projectChordLabel,
  projectShortcutOf,
  tabAfter,
} from "../project-shortcuts";

function chord(
  key: string,
  held: Partial<ProjectKeyChord> = {}
): ProjectKeyChord {
  return {
    altKey: false,
    code: key.length === 1 ? `Digit${key}` : key,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    type: "keydown",
    ...held,
  };
}

const MAC = { altKey: true, metaKey: true };
const ELSEWHERE = { altKey: true, ctrlKey: true };

describe("a project's tab shortcuts", () => {
  it("live on command-option on macOS, control-alt elsewhere", () => {
    expect(projectShortcutOf(chord("ArrowRight", MAC), true)).toEqual({
      kind: "next",
    });
    expect(projectShortcutOf(chord("ArrowLeft", MAC), true)).toEqual({
      kind: "previous",
    });
    expect(projectShortcutOf(chord("ArrowRight", ELSEWHERE), false)).toEqual({
      kind: "next",
    });
    expect(projectShortcutOf(chord("ArrowRight", ELSEWHERE), true)).toBeNull();
    expect(projectShortcutOf(chord("ArrowRight", MAC), false)).toBeNull();
  });

  it("jump to a tab by its position, even when option changed the key", () => {
    expect(
      projectShortcutOf(chord("¡", { ...MAC, code: "Digit1" }), true)
    ).toEqual({ index: 0, kind: "tab" });
    expect(projectShortcutOf(chord("7", ELSEWHERE), false)).toEqual({
      index: 6,
      kind: "tab",
    });
    expect(projectShortcutOf(chord("0", MAC), true)).toBeNull();
  });

  it("let the history and session arrows through", () => {
    expect(
      projectShortcutOf(chord("ArrowLeft", { altKey: true }), false)
    ).toBeNull();
    expect(
      projectShortcutOf(chord("ArrowRight", { metaKey: true }), true)
    ).toBeNull();
    expect(
      projectShortcutOf(chord("ArrowRight", { ...MAC, shiftKey: true }), true)
    ).toBeNull();
    expect(
      projectShortcutOf(chord("ArrowRight", { ...MAC, type: "keyup" }), true)
    ).toBeNull();
  });

  it("are written with the platform's keys", () => {
    expect(projectChordLabel(true)).toBe("⌘⌥");
    expect(projectChordLabel(false)).toBe("Ctrl+Alt+");
  });

  it("move to the neighbour with wrap-around, jump to a position, ignore a position that does not exist", () => {
    const tabs = ["overview", "logs", "files"] as const;

    expect(tabAfter(tabs, "files", { kind: "next" })).toBe("overview");
    expect(tabAfter(tabs, "overview", { kind: "previous" })).toBe("files");
    expect(tabAfter(tabs, "logs", { index: 2, kind: "tab" })).toBe("files");
    expect(tabAfter(tabs, "logs", { index: 3, kind: "tab" })).toBeNull();
  });
});
