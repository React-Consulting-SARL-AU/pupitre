import { describe, expect, it } from "bun:test";
import { insideFrame, readBounds } from "../view-bounds";

/**
 * The rectangle the renderer measured, read as a suggestion.
 *
 * The page of a provider is laid over a tab, and the tab is drawn by the
 * renderer: the rectangle comes from there. It is checked and bounded here, so
 * a page can never be pushed off the window or shrunk to a sliver.
 */

const FRAME = { height: 800, width: 1200 };

describe("readBounds", () => {
  it("refuse ce qui n'est pas un rectangle", () => {
    expect(readBounds(null)).toBeNull();
    expect(readBounds({ height: 10, width: 10, x: 0 })).toBeNull();
    expect(
      readBounds({ height: 10, width: 10, x: Number.NaN, y: 0 })
    ).toBeNull();
  });

  it("accepte un rectangle complet", () => {
    expect(readBounds({ height: 10, width: 20, x: 1, y: 2 })).toEqual({
      height: 10,
      width: 20,
      x: 1,
      y: 2,
    });
  });
});

describe("insideFrame", () => {
  it("garde la vue dans la fenêtre et en nombres entiers", () => {
    expect(
      insideFrame({ height: 900.6, width: 4000.4, x: -20, y: 40.7 }, FRAME)
    ).toEqual({ height: 800, width: 1200, x: 0, y: 41 });
  });

  it("ne laisse pas une vue trop petite pour être refermée", () => {
    expect(insideFrame({ height: 1, width: 1, x: 0, y: 0 }, FRAME)).toEqual({
      height: 40,
      width: 40,
      x: 0,
      y: 0,
    });
  });
});
