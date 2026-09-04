import { describe, expect, it } from "bun:test";
import { ANSI_DARK, ANSI_LIGHT } from "@pupitre/design/ansi";
import { terminalTheme } from "../terminal-theme";

/** Sentinels, not colours: what matters is that each token reaches its slot. */
const TOKENS: Record<string, string> = {
  "--sunken": "token(sunken)",
  "--ink": "token(ink)",
  "--raised": "token(raised)",
};

const read = (name: string) => TOKENS[name] ?? "";

describe("terminalTheme", () => {
  it("takes the ANSI palette of the resolved theme", () => {
    expect(terminalTheme("dark", read)).toMatchObject(ANSI_DARK);
    expect(terminalTheme("light", read)).toMatchObject(ANSI_LIGHT);
  });

  it("does not hand the two themes the same palette", () => {
    const dark = terminalTheme("dark", read);
    const light = terminalTheme("light", read);

    expect(dark.green).not.toBe(light.green);
    expect(dark.brightWhite).not.toBe(light.brightWhite);
  });

  it("takes everything around the palette from the tokens", () => {
    const theme = terminalTheme("dark", read);

    expect(theme.background).toBe(TOKENS["--sunken"]);
    expect(theme.foreground).toBe(TOKENS["--ink"]);
    expect(theme.cursor).toBe(TOKENS["--ink"]);
    expect(theme.selectionBackground).toBe(TOKENS["--raised"]);
  });
});
