import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import Faq from "./Faq.astro"

const items = [
  { question: "Windows?", answer: "The app runs on Windows 11." },
  { question: "Leaving?", answer: "The server stays yours." },
]

describe("Faq", () => {
  it("renders one native details per question, closed by default", async () => {
    const html = await render(Faq, { props: { items } })

    expect(html.match(/<details/g)).toHaveLength(2)
    expect(html.match(/<summary/g)).toHaveLength(2)
    expect(html).not.toContain("<details open")
    expect(html).toContain(">Windows?</span>")
    expect(html).toContain(">The app runs on Windows 11.</p>")
    expect(html).toContain(">Leaving?</span>")
  })

  it("needs no script", async () => {
    const html = await render(Faq, { props: { items } })

    expect(html).not.toContain("<script")
  })
})
