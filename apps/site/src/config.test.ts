import { describe, expect, it } from "vitest"
import config from "../astro.config.mjs"

describe("astro config", () => {
  it("builds a static site for pupitre.studio", () => {
    expect(config.site).toBe("https://pupitre.studio")
    expect(config.output).toBe("static")
  })

  it("serves English at / and French at /fr with trailing slashes", () => {
    expect(config.i18n?.defaultLocale).toBe("en")
    expect(config.i18n?.locales).toEqual(["en", "fr"])
    expect(config.trailingSlash).toBe("always")
  })
})
