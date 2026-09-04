import { describe, expect, it } from "vitest"
import {
  applyTheme,
  parseTheme,
  THEME_BOOT_SCRIPT,
  THEME_COOKIE,
  THEMES,
  themeCookie,
  themeFromCookie,
} from "./theme"

function runBootScript(cookie: string): Record<string, string> {
  const dataset: Record<string, string> = {}
  const document = { cookie, documentElement: { dataset } }

  new Function("document", THEME_BOOT_SCRIPT)(document)

  return dataset
}

describe("theme", () => {
  it("knows system, light and dark, system first", () => {
    expect(THEMES).toEqual(["system", "light", "dark"])
    expect(THEME_COOKIE).toBe("pupitre_theme")
  })

  it("parses a stored value and falls back to system", () => {
    expect(parseTheme("dark")).toBe("dark")
    expect(parseTheme("light")).toBe("light")
    expect(parseTheme("system")).toBe("system")
    expect(parseTheme("blue")).toBe("system")
    expect(parseTheme(undefined)).toBe("system")
  })

  it("reads the theme from a cookie header", () => {
    expect(themeFromCookie("")).toBe("system")
    expect(themeFromCookie("pupitre_theme=dark")).toBe("dark")
    expect(themeFromCookie("a=1; pupitre_theme=light; b=2")).toBe("light")
    expect(themeFromCookie("not_pupitre_theme=dark")).toBe("system")
  })

  it("writes a one-year, site-wide, lax cookie", () => {
    const cookie = themeCookie("dark", false)

    expect(cookie.startsWith("pupitre_theme=dark;")).toBe(true)
    expect(cookie).toContain("path=/")
    expect(cookie).toContain("max-age=31536000")
    expect(cookie).toContain("samesite=lax")
    expect(cookie).not.toContain("secure")
    expect(themeCookie("light", true)).toContain("secure")
  })

  it("sets data-theme for an explicit choice and removes it for system", () => {
    const dataset: Record<string, string> = {}
    const root = { dataset } as unknown as HTMLElement

    applyTheme(root, "dark")
    expect(dataset.theme).toBe("dark")

    applyTheme(root, "light")
    expect(dataset.theme).toBe("light")

    applyTheme(root, "system")
    expect(dataset.theme).toBeUndefined()
  })

  it("ships a boot script small enough to inline before the first paint", () => {
    expect(THEME_BOOT_SCRIPT.length).toBeLessThan(200)
    expect(THEME_BOOT_SCRIPT).toContain(THEME_COOKIE)
    expect(THEME_BOOT_SCRIPT).not.toContain("</script")
  })

  it("boots the stored theme and leaves system to prefers-color-scheme", () => {
    expect(runBootScript("pupitre_theme=dark")).toEqual({ theme: "dark" })
    expect(runBootScript("x=1; pupitre_theme=light")).toEqual({
      theme: "light",
    })
    expect(runBootScript("pupitre_theme=system")).toEqual({})
    expect(runBootScript("")).toEqual({})
    expect(runBootScript("pupitre_theme=darkish")).toEqual({})
  })
})
