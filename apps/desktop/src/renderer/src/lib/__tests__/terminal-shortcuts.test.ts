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

describe("les raccourcis d'un terminal", () => {
  it("vivent sur la touche commande sur macOS", () => {
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

  it("laissent le copier-coller au système sur macOS", () => {
    expect(shortcutOf(press("c", { metaKey: true }), true)).toBeNull();
    expect(shortcutOf(press("v", { metaKey: true }), true)).toBeNull();
  });

  it("passent sur contrôle+majuscule ailleurs, et y prennent le copier-coller", () => {
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

  it("laissent ^C et ^D au shell", () => {
    expect(shortcutOf(press("c", { ctrlKey: true }), false)).toBeNull();
    expect(shortcutOf(press("d", { ctrlKey: true }), true)).toBeNull();
  });

  it("numérotent les onglets et se déplacent entre eux", () => {
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

  it("agrandissent et remettent la taille du texte", () => {
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

  it("ne réagissent ni au relâchement ni à la touche option", () => {
    expect(
      shortcutOf(press("t", { metaKey: true, type: "keyup" }), true)
    ).toBeNull();
    expect(
      shortcutOf(press("t", { altKey: true, metaKey: true }), true)
    ).toBeNull();
  });

  it("nomment la touche du raccourci selon la plateforme", () => {
    expect(chordLabel(true)).toBe("⌘");
    expect(chordLabel(false)).toBe("Ctrl+Shift+");
  });
});
