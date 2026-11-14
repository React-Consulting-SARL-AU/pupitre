import { describe, expect, it } from "bun:test";
import {
  type CompletionState,
  type KeyChord,
  keyAction,
  NOTHING,
} from "../completion";

const SHOWN: CompletionState = {
  ...NOTHING,
  candidates: [
    { kind: "history", text: "echo commit" },
    { kind: "history", text: "echo status" },
  ],
  ghost: " commit",
  line: "echo",
  token: "echo",
};

function key(name: string, held: Partial<KeyChord> = {}): KeyChord {
  return {
    altKey: false,
    ctrlKey: false,
    key: name,
    metaKey: false,
    shiftKey: false,
    ...held,
  };
}

describe("the keys while a completion shows", () => {
  it("chooses nothing for the reader", () => {
    expect(NOTHING.selection).toBe(-1);
    expect(keyAction(SHOWN, key("Enter"))).toEqual({
      kind: "dismiss",
      pass: true,
    });
  });

  it("leaves erasing and moving back to the shell, and hushes the suggestion", () => {
    for (const name of ["Backspace", "Delete", "ArrowLeft", "Home"]) {
      expect(keyAction(SHOWN, key(name))).toEqual({ kind: "quiet" });
    }

    expect(keyAction(SHOWN, key("w", { ctrlKey: true }))).toEqual({
      kind: "quiet",
    });
  });

  it("wakes the suggestion on the next typed character", () => {
    expect(keyAction(NOTHING, key("o"))).toEqual({ kind: "type" });
  });

  it("enters the list with the down arrow and leaves it with the up one", () => {
    expect(keyAction(SHOWN, key("ArrowDown"))).toEqual({
      index: 0,
      kind: "choose",
    });
    expect(keyAction(SHOWN, key("ArrowUp"))).toEqual({ kind: "pass" });
    expect(keyAction({ ...SHOWN, selection: 0 }, key("ArrowUp"))).toEqual({
      index: -1,
      kind: "choose",
    });
  });

  it("takes what was chosen with Enter or Tab, the suggestion otherwise", () => {
    const chosen = { ...SHOWN, selection: 1 };

    expect(keyAction(chosen, key("Enter"))).toEqual({
      index: 1,
      kind: "accept",
    });
    expect(keyAction(chosen, key("Tab"))).toEqual({ index: 1, kind: "accept" });
    expect(keyAction(SHOWN, key("Tab"))).toEqual({ kind: "ghost" });
    expect(keyAction({ ...SHOWN, ghost: "" }, key("Tab"))).toEqual({
      index: 0,
      kind: "accept",
    });
  });

  it("leaves the right arrow to the shell once a row is chosen", () => {
    expect(keyAction(SHOWN, key("ArrowRight"))).toEqual({ kind: "ghost" });
    expect(keyAction({ ...SHOWN, selection: 0 }, key("ArrowRight"))).toEqual({
      kind: "pass",
    });
  });

  it("gives every key back to the shell when nothing shows", () => {
    for (const name of [
      "Tab",
      "ArrowUp",
      "ArrowDown",
      "ArrowRight",
      "Escape",
    ]) {
      expect(keyAction(NOTHING, key(name))).toEqual({ kind: "pass" });
    }
  });
});
