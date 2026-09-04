import { describe, expect, it } from "bun:test"
import config from "../astro.config.mjs"

describe("astro config", () => {
  it("builds a static site for pupitre.sh", () => {
    expect(config.site).toBe("https://pupitre.sh")
    expect(config.output).toBe("static")
  })
})
