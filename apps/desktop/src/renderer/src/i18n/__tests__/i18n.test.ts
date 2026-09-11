import { describe, expect, it } from "bun:test";
import { en } from "../en";
import { fr } from "../fr";
import { DEFAULT_LOCALE, fill, isLocale, LOCALES, translator } from "../i18n";

describe("locales", () => {
  it("serves English by default and knows both languages", () => {
    expect(LOCALES).toEqual(["en", "fr"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("recognises a locale string", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("dictionary", () => {
  it("has exactly the same keys in both languages", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("leaves no empty string in either language", () => {
    for (const dictionary of [en, fr]) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), key).not.toBe("");
      }
    }
  });

  /** A value filled in one language and missing in the other would throw at render. */
  it("asks for the same placeholders in both languages", () => {
    const placeholders = (template: string) =>
      [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(fr[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe("translator", () => {
  it("returns the string for the locale", () => {
    const key = Object.keys(en)[0] as keyof typeof en;

    expect(translator("en")(key)).toBe(en[key]);
    expect(translator("fr")(key)).toBe(fr[key]);
  });
});

describe("fill", () => {
  it("replaces every placeholder with its value", () => {
    expect(fill("{count} left on {name}", { count: 3, name: "srv" })).toBe(
      "3 left on srv"
    );
    expect(fill("{n} and {n}", { n: 2 })).toBe("2 and 2");
  });

  it("throws on a placeholder without a value", () => {
    expect(() => fill("{price} left", {})).toThrow('Missing value for "price"');
  });
});
