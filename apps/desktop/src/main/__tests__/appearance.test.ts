import { describe, expect, it } from "bun:test";
import { DARK, LIGHT } from "@pupitre/design/tokens";
import {
  readAppearance,
  resolveTheme,
  windowBackground,
} from "../../shared/appearance";

describe("windowBackground", () => {
  it("paints the edges with the resolved theme background", () => {
    expect(windowBackground("light")).toBe(LIGHT.base);
    expect(windowBackground("dark")).toBe(DARK.base);
  });

  it("holds no colour that does not come from the tokens", () => {
    const painted = [windowBackground("light"), windowBackground("dark")];

    expect(painted).toEqual([LIGHT.base, DARK.base]);
  });
});

describe("readAppearance", () => {
  it("accepts a forced theme against the system", () => {
    expect(readAppearance({ preference: "light", resolved: "light" })).toEqual({
      preference: "light",
      resolved: "light",
    });
  });

  it("accepts following the system and the theme it gave", () => {
    expect(readAppearance({ preference: "system", resolved: "dark" })).toEqual({
      preference: "system",
      resolved: "dark",
    });
  });

  it("refuses what an older version could have sent", () => {
    expect(readAppearance(null)).toBeNull();
    expect(
      readAppearance({ preference: "solarized", resolved: "dark" })
    ).toBeNull();
    expect(readAppearance({ preference: "light" })).toBeNull();
    expect(
      readAppearance({ preference: "light", resolved: "system" })
    ).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("ignores the system as soon as a theme is forced", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
