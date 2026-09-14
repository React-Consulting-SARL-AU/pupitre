import { describe, expect, it } from "bun:test";
import { tags } from "@lezer/highlight";
import { ANSI_DARK, ANSI_LIGHT } from "@pupitre/design/ansi";
import { editorHighlight } from "../editor-theme";

function styleOf(
  theme: "light" | "dark",
  tag: (typeof tags)[keyof typeof tags]
) {
  const style = editorHighlight(theme);
  const found = style.specs.find((spec) =>
    Array.isArray(spec.tag) ? spec.tag.includes(tag) : spec.tag === tag
  );

  if (!found) {
    throw new Error("no style for that tag");
  }

  return found;
}

describe("editorHighlight", () => {
  it("colours the syntax with the ANSI palette of the resolved theme", () => {
    expect(styleOf("dark", tags.keyword).color).toBe(ANSI_DARK.magenta);
    expect(styleOf("light", tags.keyword).color).toBe(ANSI_LIGHT.magenta);
    expect(styleOf("dark", tags.string).color).toBe(ANSI_DARK.green);
    expect(styleOf("dark", tags.typeName).color).toBe(ANSI_DARK.blue);
    expect(styleOf("light", tags.invalid).color).toBe(ANSI_LIGHT.red);
  });

  it("takes the amber of the literals from the warn token, which the light theme can read", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(styleOf(theme, tags.number).color).toBe("var(--warn)");
      expect(styleOf(theme, tags.bool).color).toBe("var(--warn)");
    }
  });

  it("keeps the comments, the punctuation and the plain names in the greys", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(styleOf(theme, tags.comment).color).toBe("var(--ink-3)");
      expect(styleOf(theme, tags.punctuation).color).toBe("var(--ink-4)");
      expect(styleOf(theme, tags.variableName).color).toBe("var(--ink)");
      expect(styleOf(theme, tags.attributeName).color).toBe("var(--ink-2)");
    }
  });

  it("does not hand the two themes the same hues", () => {
    expect(styleOf("dark", tags.string).color).not.toBe(
      styleOf("light", tags.string).color
    );
  });
});
