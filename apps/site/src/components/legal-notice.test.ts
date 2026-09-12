import { developmentNotice, SUB_PROCESSORS } from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import DevelopmentBanner from "./DevelopmentBanner.astro"
import LegalNotice from "./LegalNotice.astro"
import SubProcessors from "./SubProcessors.astro"

describe("LegalNotice", () => {
  it("dit en anglais que le projet est en développement et que rien n'engage", async () => {
    const html = await render(LegalNotice, { path: "/legal/terms/" })
    const notice = developmentNotice("en")

    expect(html).toContain('role="note"')
    expect(html).toContain(notice.title)
    expect(html).toContain(notice.body)
    expect(html).toContain(notice.entity)
  })

  it("le dit en français sur les pages françaises", async () => {
    const html = await render(LegalNotice, { path: "/fr/legal/terms/" })

    expect(html).toContain(developmentNotice("fr").title)
  })
})

describe("DevelopmentBanner", () => {
  it("dit sur chaque page, dans sa langue, que le projet est en développement", async () => {
    expect(await render(DevelopmentBanner, { path: "/" })).toContain(
      developmentNotice("en").banner
    )
    expect(await render(DevelopmentBanner, { path: "/fr/pricing/" })).toContain(
      developmentNotice("fr").banner
    )
  })
})

describe("SubProcessors", () => {
  it("liste chaque sous-traitant dans la langue de la page", async () => {
    const html = await render(SubProcessors, { path: "/fr/legal/privacy/" })

    for (const processor of SUB_PROCESSORS) {
      expect(html).toContain(processor.name)
      expect(html).toContain(processor.purpose.fr)
    }
  })
})
