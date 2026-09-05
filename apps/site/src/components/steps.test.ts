import { describe, expect, it } from "vitest"
import { homeContent } from "../content/site/home"
import { render } from "../test/render"
import Steps from "./Steps.astro"

describe("Steps", () => {
  it("numbers every step in order", async () => {
    const items = homeContent("en").steps.items
    const html = await render(Steps, { props: { items } })

    expect(html.match(/<li[\s>]/g)).toHaveLength(items.length)
    expect(html).toContain('<p class="step-number">1</p>')
    expect(html).toContain(`<p class="step-number">${items.length}</p>`)

    for (const item of items) {
      expect(html).toContain(`>${item.title}</h3>`)
      expect(html).toContain(item.detail)
    }
  })
})
