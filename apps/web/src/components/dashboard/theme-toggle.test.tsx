import { afterEach, describe, expect, it } from "bun:test"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import { render, trigger } from "@/testing/render"

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }

  document.documentElement.removeAttribute("data-theme")
  localStorage.clear()
})

describe("ThemeToggle", () => {
  it("opens a menu with the three themes under a group label", async () => {
    const { container, unmount, click } = await render(<ThemeToggle />)

    mounted.push(unmount)

    await click(trigger(container, "System"))

    const items = [...document.querySelectorAll("[role=menuitemradio]")]

    expect(items.map((item) => item.textContent)).toEqual([
      "System",
      "Light",
      "Dark",
    ])
    expect(document.body.textContent).toContain("Theme")
  })

  it("names its icon in a tooltip", async () => {
    const { container, unmount } = await render(<ThemeToggle />)

    mounted.push(unmount)

    expect(trigger(container, "System").title).toBe("Theme")
  })

  it("stamps the root and remembers the choice", async () => {
    const { container, unmount, click } = await render(<ThemeToggle />)

    mounted.push(unmount)

    await click(trigger(container, "System"))

    const dark = [...document.querySelectorAll("[role=menuitemradio]")].find(
      (item) => item.textContent === "Dark"
    )

    if (!dark) {
      throw new Error("the dark entry is missing")
    }

    await click(dark)

    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(localStorage.getItem("pupitre_theme")).toBe("dark")
  })
})
