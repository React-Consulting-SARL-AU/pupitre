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

describe("history shortcuts", () => {
  it("live on command and the brackets on macOS", () => {
    expect(historyStepOf(chord("[", { metaKey: true }), true)).toBe("back");
    expect(historyStepOf(chord("]", { metaKey: true }), true)).toBe("forward");
    expect(historyStepOf(chord("[", { altKey: true }), true)).toBeNull();
    expect(
      historyStepOf(chord("ArrowLeft", { altKey: true }), true)
    ).toBeNull();
  });

  it("live on alt and the arrows elsewhere", () => {
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

  it("let through a released key or one held with shift", () => {
    expect(
      historyStepOf(chord("[", { metaKey: true, type: "keyup" }), true)
    ).toBeNull();
    expect(
      historyStepOf(chord("[", { metaKey: true, shiftKey: true }), true)
    ).toBeNull();
  });

  it("read a mouse's two side buttons", () => {
    expect(historyStepOfButton(3)).toBe("back");
    expect(historyStepOfButton(4)).toBe("forward");
    expect(historyStepOfButton(0)).toBeNull();
  });

  it("print the platform's shortcut", () => {
    expect(historyChord("back", true)).toBe("⌘[");
    expect(historyChord("forward", false)).toBe("Alt+→");
  });
});
