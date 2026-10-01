import { SUB_PROCESSORS } from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import SubProcessors from "./SubProcessors.astro"

describe("SubProcessors", () => {
  it("lists every sub-processor in the page's language", async () => {
    const html = await render(SubProcessors, { path: "/fr/legal/privacy/" })

    for (const processor of SUB_PROCESSORS) {
      expect(html).toContain(processor.name)
      expect(html).toContain(processor.purpose.fr)
    }
  })
})
