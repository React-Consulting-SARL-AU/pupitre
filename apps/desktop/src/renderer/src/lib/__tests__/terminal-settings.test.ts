import { describe, expect, it } from "bun:test";
import {
  DEFAULT_TERMINAL_SETTINGS,
  FONT_STACKS,
  steppedFontSize,
  TERMINAL_FONT_FAMILIES,
  terminalSettingsOf,
} from "../terminal-settings";

describe("les réglages du terminal lus sur le disque", () => {
  it("gardent ce qui est valide et remplacent le reste par le défaut", () => {
    expect(
      terminalSettingsOf({
        cursorBlink: false,
        fontFamily: "menlo",
        fontSize: 15,
        scrollback: 20_000,
      })
    ).toEqual({
      cursorBlink: false,
      fontFamily: "menlo",
      fontSize: 15,
      scrollback: 20_000,
    });

    expect(
      terminalSettingsOf({
        cursorBlink: "oui",
        fontFamily: "Comic Sans",
        fontSize: 200,
        scrollback: -1,
      })
    ).toEqual(DEFAULT_TERMINAL_SETTINGS);

    expect(terminalSettingsOf(undefined)).toEqual(DEFAULT_TERMINAL_SETTINGS);
  });

  it("n'offrent que des polices que le terminal sait mesurer", () => {
    for (const family of TERMINAL_FONT_FAMILIES) {
      expect(FONT_STACKS[family]).toContain("monospace");
    }
  });
});

describe("le pas de la taille", () => {
  it("reste dans ses bornes et revient au défaut sur zéro", () => {
    expect(steppedFontSize(13, 1)).toBe(14);
    expect(steppedFontSize(24, 1)).toBe(24);
    expect(steppedFontSize(9, -1)).toBe(9);
    expect(steppedFontSize(20, 0)).toBe(DEFAULT_TERMINAL_SETTINGS.fontSize);
  });
});
