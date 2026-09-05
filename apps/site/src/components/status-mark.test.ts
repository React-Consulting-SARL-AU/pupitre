import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import StatusMark from "./StatusMark.astro"

describe("StatusMark", () => {
  it("says the state by shape, and names it for a screen reader", async () => {
    const running = await render(StatusMark, {
      props: { mark: "on", label: "Running" },
    })

    expect(running).toContain('data-mark="on"')
    expect(running).toContain("mark-dot mark-dot-on")
    expect(running).toContain('<span class="sr-only">Running</span>')
  })

  it("uses a different shape for each state", async () => {
    const marks = await Promise.all(
      (["on", "warn", "off"] as const).map((mark) =>
        render(StatusMark, { props: { mark, label: mark } })
      )
    )

    expect(new Set(marks).size).toBe(3)
    expect(marks[1]).toContain("mark-dot-warn")
    expect(marks[2]).toContain("mark-dot-off")
  })
})
