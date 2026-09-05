import { describe, expect, it } from "vitest"
import { homeContent } from "../content/site/home"
import { render } from "../test/render"
import Steps from "./Steps.astro"

describe("Steps", () => {
  it("numbers the onboarding in order", async () => {
    const items = homeContent("en").steps.items
    const html = await render(Steps, { props: { items } })

    expect(html).toContain(">01</p>")
    expect(html).toContain(">07</p>")
    expect(html.match(/<li/g)).toHaveLength(items.length)

    for (const item of items) {
      expect(html).toContain(`>${item.title}</h3>`)
    }
  })
})
