import { describe, expect, it } from "bun:test";
import { chordLabel, type KeyChord, shortcutOf } from "../terminal-shortcuts";

function press(key: string, held: Partial<KeyChord> = {}): KeyChord {
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

describe("a terminal's shortcuts", () => {
  it("live on the command key on macOS", () => {
    expect(shortcutOf(press("t", { metaKey: true }), true)).toEqual({
      kind: "new",
    });
    expect(shortcutOf(press("w", { metaKey: true }), true)).toEqual({
      kind: "close",
    });
    expect(shortcutOf(press("f", { metaKey: true }), true)).toEqual({
      kind: "search",
    });
    expect(shortcutOf(press("k", { metaKey: true }), true)).toEqual({
      kind: "clear",
    });
  });

  it("leave copy and paste to the system on macOS", () => {
    expect(shortcutOf(press("c", { metaKey: true }), true)).toBeNull();
    expect(shortcutOf(press("v", { metaKey: true }), true)).toBeNull();
  });

  it("move to control+shift elsewhere, and take over copy and paste there", () => {
    expect(
      shortcutOf(press("T", { ctrlKey: true, shiftKey: true }), false)
    ).toEqual({ kind: "new" });
    expect(
      shortcutOf(press("C", { ctrlKey: true, shiftKey: true }), false)
    ).toEqual({ kind: "copy" });
    expect(
      shortcutOf(press("V", { ctrlKey: true, shiftKey: true }), false)
    ).toEqual({ kind: "paste" });
  });

  it("leave ^C and ^D to the shell", () => {
    expect(shortcutOf(press("c", { ctrlKey: true }), false)).toBeNull();
    expect(shortcutOf(press("d", { ctrlKey: true }), true)).toBeNull();
  });

  it("number the tabs and move between them", () => {
    expect(shortcutOf(press("3", { metaKey: true }), true)).toEqual({
      index: 2,
      kind: "tab",
    });
    expect(
      shortcutOf(press("}", { metaKey: true, shiftKey: true }), true)
    ).toEqual({
      kind: "next",
    });
    expect(shortcutOf(press("[", { metaKey: true }), true)).toEqual({
      kind: "previous",
    });
    expect(
      shortcutOf(press("Tab", { ctrlKey: true, shiftKey: true }), false)
    ).toEqual({ kind: "previous" });
  });

  it("enlarge and reset the text size", () => {
    expect(shortcutOf(press("=", { metaKey: true }), true)).toEqual({
      kind: "zoomIn",
    });
    expect(shortcutOf(press("-", { metaKey: true }), true)).toEqual({
      kind: "zoomOut",
    });
    expect(shortcutOf(press("0", { metaKey: true }), true)).toEqual({
      kind: "zoomReset",
    });
  });

  it("react to neither key release nor the option key", () => {
    expect(
      shortcutOf(press("t", { metaKey: true, type: "keyup" }), true)
    ).toBeNull();
    expect(
      shortcutOf(press("t", { altKey: true, metaKey: true }), true)
    ).toBeNull();
  });

  it("name the shortcut key according to the platform", () => {
    expect(chordLabel(true)).toBe("⌘");
    expect(chordLabel(false)).toBe("Ctrl+Shift+");
  });
});
