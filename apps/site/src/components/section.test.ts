import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import Section from "./Section.astro"

describe("Section", () => {
  it("renders a labelled, titled section with its content", async () => {
    const html = await render(Section, {
      props: { id: "catalog", label: "Catalogue", title: "What it installs" },
      slots: { default: "<p>List</p>" },
    })

    expect(html).toContain('<section id="catalog"')
    expect(html).toContain('aria-labelledby="catalog-title"')
    expect(html).toContain('<p class="eyebrow">Catalogue</p>')
    expect(html).toContain('<h2 id="catalog-title" class="heading-2')
    expect(html).toContain(">What it installs</h2>")
    expect(html).toContain("<p>List</p>")
    expect(html).not.toContain('class="lead')
  })

  it("adds a lead paragraph when given", async () => {
    const html = await render(Section, {
      props: {
        id: "faq",
        label: "FAQ",
        title: "Questions",
        lead: "Honest answers.",
      },
    })

    expect(html).toContain(">Honest answers.</p>")
  })

  it("takes no numbered mark, on the header or in the stylesheet", async () => {
    const html = await render(Section, {
      props: { id: "faq", label: "FAQ", title: "Questions" },
    })
    const stylesheet = readFileSync(
      path.resolve(import.meta.dirname, "../styles/global.css"),
      "utf8"
    )

    expect(html).not.toContain("index-mark")
    expect(stylesheet).not.toContain("index-mark")
  })
})
