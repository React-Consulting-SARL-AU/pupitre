import { describe, expect, it } from "bun:test";
import { isThemePreference, resolveTheme } from "../theme";

describe("resolveTheme", () => {
  it("follows the system when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the system once a theme is forced", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("isThemePreference", () => {
  it("accepts the three choices", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
  });

  it("rejects whatever an older version may have written down", () => {
    expect(isThemePreference("solarized")).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});
