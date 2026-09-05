import path from "node:path"
import { describe, expect, it } from "vitest"
import { missingRedirects, redirectSources, topLevelRoutes } from "./redirects"

const ROOT = path.join(import.meta.dirname, "..")

describe("redirectSources", () => {
  it("reads the source of each rule and ignores comments and blank lines", () => {
    const sources = redirectSources(
      "# a comment\n\n/docs /docs/ 301\n/blog  /blog/  301\n"
    )

    expect([...sources]).toEqual(["/docs", "/blog"])
  })

  it("keeps out a rule whose source is a full URL", () => {
    const sources = redirectSources(
      "https://www.pupitre.studio/* https://pupitre.studio/:splat 301\n"
    )

    expect(sources.size).toBe(0)
  })
})

describe("topLevelRoutes", () => {
  it("lists the first-level pages of both languages", () => {
    const routes = topLevelRoutes(ROOT)

    expect(routes).toContain("/pricing")
    expect(routes).toContain("/download")
    expect(routes).toContain("/fr")
    expect(routes).toContain("/fr/pricing")
    expect(routes).toContain("/fr/docs")
  })

  it("leaves out the home page, the not-found page and the image endpoints", () => {
    const routes = topLevelRoutes(ROOT)

    expect(routes).not.toContain("/index")
    expect(routes).not.toContain("/404")
    expect(routes).not.toContain("/og")
  })
})

describe("missingRedirects", () => {
  it("every first-level page answers without its trailing slash", () => {
    expect(missingRedirects(ROOT)).toEqual([])
  })
})
