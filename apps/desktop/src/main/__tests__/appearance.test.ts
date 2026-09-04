import { describe, expect, it } from "bun:test";
import { DARK, LIGHT } from "@pupitre/design/tokens";
import {
  readAppearance,
  resolveTheme,
  windowBackground,
} from "../../shared/appearance";

describe("windowBackground", () => {
  it("peint les bords avec le fond du thème résolu", () => {
    expect(windowBackground("light")).toBe(LIGHT.base);
    expect(windowBackground("dark")).toBe(DARK.base);
  });

  it("ne tient aucune couleur qui ne vienne des tokens", () => {
    const painted = [windowBackground("light"), windowBackground("dark")];

    expect(painted).toEqual([LIGHT.base, DARK.base]);
  });
});

describe("readAppearance", () => {
  it("accepte un thème forcé contre le système", () => {
    expect(readAppearance({ preference: "light", resolved: "light" })).toEqual({
      preference: "light",
      resolved: "light",
    });
  });

  it("accepte le suivi du système et le thème qu'il a donné", () => {
    expect(readAppearance({ preference: "system", resolved: "dark" })).toEqual({
      preference: "system",
      resolved: "dark",
    });
  });

  it("refuse ce qu'une version plus ancienne aurait pu envoyer", () => {
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
  it("ignore le système dès qu'un thème est forcé", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("suit le système quand la préférence est system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
