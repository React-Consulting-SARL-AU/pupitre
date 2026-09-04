import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import Claim from "./Claim.astro"

describe("Claim", () => {
  it("renders the statement as a heading and the proof under it", async () => {
    const html = await render(Claim, {
      props: {
        statement: "No inbound connection.",
        proof: "The app opens an SSH session from your laptop.",
      },
    })

    expect(html).toContain('<h3 class="heading-3')
    expect(html).toContain(">No inbound connection.</h3>")
    expect(html).toContain(
      ">The app opens an SSH session from your laptop.</p>"
    )
  })
})
