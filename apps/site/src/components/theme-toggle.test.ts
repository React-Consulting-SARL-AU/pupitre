import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import ThemeToggle from "./ThemeToggle.astro"

const BUTTON_RE = /<button[^>]*>/g

describe("ThemeToggle", () => {
  it("hides the three choices behind one icon, system chosen by default", async () => {
    const html = await render(ThemeToggle)
    const buttons = [...html.matchAll(BUTTON_RE)].map((m) => m[0])

    expect(html).toContain("data-theme-menu")
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

  it("shows the icon of the current theme and hides the others", async () => {
    const html = await render(ThemeToggle)
    const icons = [...html.matchAll(/<svg[^>]*data-theme-icon="(\w+)"[^>]*>/g)]

    expect(icons).toHaveLength(3)
    expect(icons[0][0]).toContain('class="size-4"')
    expect(icons[1][0]).toContain("hidden")
    expect(icons[2][0]).toContain("hidden")
  })

  it("names the choices for a reader who opens the menu", async () => {
    const html = await render(ThemeToggle, { path: "/fr/" })

    expect(html).toContain('aria-label="Thème"')
    expect(html).toContain(">Système<")
    expect(html).toContain(">Clair<")
    expect(html).toContain(">Sombre<")
  })

  it("opens upward when it sits at the bottom of the page", async () => {
    const html = await render(ThemeToggle, { props: { placement: "up" } })

    expect(html).toContain("bottom-full")
  })
})
