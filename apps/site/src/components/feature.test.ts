import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import Feature from "./Feature.astro"

const props = {
  title: "Inspect and install",
  lines: ["Rent a VPS.", "Pupitre inspects it.", "Pick your services."],
}

describe("Feature", () => {
  it("renders a title and its lines as a list, without any icon", async () => {
    const html = await render(Feature, { props })

    expect(html).toContain('<h3 class="heading-3')
    expect(html).toContain(">Inspect and install</h3>")
    expect(html.match(/<li/g)).toHaveLength(3)
    expect(html).toContain(">Rent a VPS.</li>")
    expect(html).toContain(">Pick your services.</li>")
    expect(html).not.toContain("<svg")
    expect(html).not.toContain("<img")
  })
})
