import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import Callout from "./Callout.astro"

const slots = { default: "<p>Text</p>" }
const STATE_TEXT_RE = /text-(ok|warn|danger)/
const HEX_RE = /#[0-9a-f]{3,8}\b/i

describe("Callout", () => {
  it("renders an info note as a bordered block without a mark", async () => {
    const html = await render(Callout, { props: { kind: "info" }, slots })

    expect(html).toContain('data-kind="info"')
    expect(html).toContain('role="note"')
    expect(html).toContain(">Note</")
    expect(html).not.toContain("data-mark")
    expect(html).toContain("<p>Text</p>")
  })

  it("marks a warning with an outlined sign and the warn state colour on the rule", async () => {
    const html = await render(Callout, { props: { kind: "warn" }, slots })

    expect(html).toContain('data-kind="warn"')
    expect(html).toContain('data-mark="outline"')
    expect(html).toContain("border-l-warn")
    expect(html).toContain(">Warning</")
  })

  it("marks a danger with a filled sign and the danger state colour on the rule", async () => {
    const html = await render(Callout, { props: { kind: "danger" }, slots })

    expect(html).toContain('data-kind="danger"')
    expect(html).toContain('data-mark="filled"')
    expect(html).toContain("border-l-danger")
    expect(html).toContain(">Danger</")
  })

  it("takes a custom title and translates the default one", async () => {
    const custom = await render(Callout, {
      props: { kind: "warn", title: "Before you start" },
      slots,
    })
    const french = await render(Callout, {
      props: { kind: "warn" },
      slots,
      path: "/fr/docs/",
    })

    expect(custom).toContain(">Before you start</")
    expect(french).toContain(">Attention</")
  })

  it("never paints text with a state colour", async () => {
    for (const kind of ["info", "warn", "danger"]) {
      const html = await render(Callout, { props: { kind }, slots })

      expect(html).not.toMatch(STATE_TEXT_RE)
      expect(html).not.toMatch(HEX_RE)
    }
  })
})
