import { describe, expect, it } from "bun:test";
import { piecesOf } from "../addresses";

describe("les adresses d'une ligne", () => {
  it("découpent la ligne autour de chaque adresse, dans l'ordre", () => {
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

  it("laissent une ligne sans adresse en un seul morceau", () => {
    expect(piecesOf("plain text")).toEqual([
      { kind: "text", text: "plain text" },
    ]);
    expect(piecesOf("")).toEqual([{ kind: "text", text: "" }]);
  });

  it("gardent la parenthèse qui ferme celle ouverte dans l'adresse", () => {
    expect(piecesOf("https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual([
      { kind: "address", text: "https://en.wikipedia.org/wiki/Foo_(bar)" },
    ]);
  });
});
