import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import ThemeToggle from "./ThemeToggle.astro"

const BUTTON_RE = /<button[^>]*>/g

describe("ThemeToggle", () => {
  it("offers system, light and dark as pressed buttons, system pressed by default", async () => {
    const html = await render(ThemeToggle)
    const buttons = [...html.matchAll(BUTTON_RE)].map((m) => m[0])

    expect(html).toContain(
      '<div role="group" aria-label="Theme" data-theme-toggle'
    )
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toContain('data-theme-option="system"')
    expect(buttons[0]).toContain('aria-pressed="true"')
    expect(buttons[1]).toContain('data-theme-option="light"')
    expect(buttons[1]).toContain('aria-pressed="false"')
    expect(buttons[2]).toContain('data-theme-option="dark"')
    expect(buttons[2]).toContain('aria-pressed="false"')
    expect(buttons.every((b) => b.includes('type="button"'))).toBe(true)
  })

  it("translates the labels", async () => {
    const html = await render(ThemeToggle, { path: "/fr/" })

    expect(html).toContain('aria-label="Thème"')
    expect(html).toContain(">Système<")
    expect(html).toContain(">Clair<")
    expect(html).toContain(">Sombre<")
  })
})
