import { describe, expect, it } from "bun:test";
import { piecesOf } from "../addresses";

describe("a line's addresses", () => {
  it("split the line around each address, in order", () => {
    expect(
      piecesOf(
        "ready on https://atlas.example.com/ (see http://127.0.0.1:3100)."
      )
    ).toEqual([
      { kind: "text", text: "ready on " },
      { kind: "address", text: "https://atlas.example.com/" },
      { kind: "text", text: " (see " },
      { kind: "address", text: "http://127.0.0.1:3100" },
      { kind: "text", text: ")." },
    ]);
  });

  it("leave a line without an address in a single piece", () => {
    expect(piecesOf("plain text")).toEqual([
      { kind: "text", text: "plain text" },
    ]);
    expect(piecesOf("")).toEqual([{ kind: "text", text: "" }]);
  });

  it("keep the parenthesis that closes the one opened in the address", () => {
    expect(piecesOf("https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual([
      { kind: "address", text: "https://en.wikipedia.org/wiki/Foo_(bar)" },
    ]);
  });
});
