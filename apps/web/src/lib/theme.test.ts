import { describe, expect, it } from "bun:test"
import { applyTheme, parseTheme, THEME_BOOT_SCRIPT } from "@/lib/theme"

describe("parseTheme", () => {
  it("falls back to system for anything unknown", () => {
    expect(parseTheme("dark")).toBe("dark")
    expect(parseTheme("sepia")).toBe("system")
    expect(parseTheme(null)).toBe("system")
  })
})

describe("applyTheme", () => {
  it("stamps the root for an explicit theme and clears it for system", () => {
    const root = document.createElement("html")

    applyTheme(root, "dark")
    expect(root.dataset.theme).toBe("dark")

    applyTheme(root, "system")
    expect(root.hasAttribute("data-theme")).toBe(false)
  })
})

describe("THEME_BOOT_SCRIPT", () => {
  it("reads the stored theme before the first paint and never throws", () => {
    expect(THEME_BOOT_SCRIPT).toContain("pupitre_theme")
    expect(THEME_BOOT_SCRIPT).toContain("catch")
  })
})
