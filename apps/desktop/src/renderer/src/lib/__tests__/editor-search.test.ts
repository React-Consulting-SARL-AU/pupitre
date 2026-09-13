import { describe, expect, it } from "bun:test";
import { SearchQuery } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { editorPhrases } from "@renderer/i18n/editor-phrases";
import { translator } from "@renderer/i18n/i18n";
import { countMatches, MATCH_CAP } from "../editor-search";

function stateOf(doc: string, selection?: { anchor: number; head: number }) {
  return EditorState.create({ doc, selection });
}

describe("countMatches", () => {
  it("counts every match and ranks the one under the cursor", () => {
    const state = stateOf("port port port", { anchor: 5, head: 9 });

    expect(countMatches(state, new SearchQuery({ search: "port" }))).toEqual({
      capped: false,
      current: 2,
      total: 3,
    });
  });

  it("leaves the rank empty when the cursor is not on a match", () => {
    const state = stateOf("port port", { anchor: 0, head: 0 });

    expect(countMatches(state, new SearchQuery({ search: "port" }))).toEqual({
      capped: false,
      current: null,
      total: 2,
    });
  });

  it("honours case, whole word and regular expressions", () => {
    const state = stateOf("Port port portal");

    expect(
      countMatches(
        state,
        new SearchQuery({ caseSensitive: true, search: "port" })
      ).total
    ).toBe(2);
    expect(
      countMatches(state, new SearchQuery({ search: "port", wholeWord: true }))
        .total
    ).toBe(2);
    expect(
      countMatches(state, new SearchQuery({ regexp: true, search: "p\\w+l" }))
        .total
    ).toBe(1);
  });

  it("counts nothing for an empty or invalid query", () => {
    const state = stateOf("port");

    expect(countMatches(state, new SearchQuery({ search: "" })).total).toBe(0);
    expect(
      countMatches(state, new SearchQuery({ regexp: true, search: "(" })).total
    ).toBe(0);
  });

  it("stops at the cap and says so", () => {
    const state = stateOf("a ".repeat(MATCH_CAP + 50));

    expect(countMatches(state, new SearchQuery({ search: "a" }))).toEqual({
      capped: true,
      current: null,
      total: MATCH_CAP,
    });
  });
});

describe("editorPhrases", () => {
  it("speaks the editor's own announcements in the locale", () => {
    const state = EditorState.create({
      extensions: editorPhrases(translator("fr")),
    });

    expect(state.phrase("current match")).toBe("résultat courant");
    expect(state.phrase("replaced $ matches", 3)).toBe("3 résultats remplacés");
    expect(state.phrase("Go to line")).toBe("Aller à la ligne");
  });
});
