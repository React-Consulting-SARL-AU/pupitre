import { describe, expect, it } from "bun:test";
import {
  historyChord,
  historyStepOf,
  historyStepOfButton,
} from "../history-shortcuts";
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

describe("les raccourcis de l'historique", () => {
  it("vivent sur commande et les crochets sur macOS", () => {
    expect(historyStepOf(chord("[", { metaKey: true }), true)).toBe("back");
    expect(historyStepOf(chord("]", { metaKey: true }), true)).toBe("forward");
    expect(historyStepOf(chord("[", { altKey: true }), true)).toBeNull();
    expect(
      historyStepOf(chord("ArrowLeft", { altKey: true }), true)
    ).toBeNull();
  });

  it("vivent sur alt et les flèches ailleurs", () => {
    expect(historyStepOf(chord("ArrowLeft", { altKey: true }), false)).toBe(
      "back"
    );
    expect(historyStepOf(chord("ArrowRight", { altKey: true }), false)).toBe(
      "forward"
    );
    expect(historyStepOf(chord("[", { metaKey: true }), false)).toBeNull();
    expect(
      historyStepOf(chord("ArrowLeft", { ctrlKey: true }), false)
    ).toBeNull();
  });

  it("laissent passer une touche relâchée ou tenue avec majuscule", () => {
    expect(
      historyStepOf(chord("[", { metaKey: true, type: "keyup" }), true)
    ).toBeNull();
    expect(
      historyStepOf(chord("[", { metaKey: true, shiftKey: true }), true)
    ).toBeNull();
  });

  it("lisent les deux boutons latéraux d'une souris", () => {
    expect(historyStepOfButton(3)).toBe("back");
    expect(historyStepOfButton(4)).toBe("forward");
    expect(historyStepOfButton(0)).toBeNull();
  });

  it("impriment le raccourci de la plateforme", () => {
    expect(historyChord("back", true)).toBe("⌘[");
    expect(historyChord("forward", false)).toBe("Alt+→");
  });
});
