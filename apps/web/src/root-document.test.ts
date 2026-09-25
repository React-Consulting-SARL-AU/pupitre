import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const ROOT_ROUTE = readFileSync(
  path.join(import.meta.dir, "routes", "__root.tsx"),
  "utf8"
)

const GLOBAL_STYLES = readFileSync(
  path.join(import.meta.dir, "styles", "globals.css"),
  "utf8"
)

describe("the root document", () => {
  it("serves its fonts itself, so no page asks Google for them", () => {
    expect(ROOT_ROUTE).not.toContain("fonts.googleapis.com")
    expect(ROOT_ROUTE).not.toContain("fonts.gstatic.com")
    expect(GLOBAL_STYLES).toContain('@import "@pupitre/design/fonts.css"')
  })

  it("boots the theme through a script that carries the request's nonce", () => {
    expect(ROOT_ROUTE).toContain("<ScriptOnce>{THEME_BOOT_SCRIPT}</ScriptOnce>")
    expect(ROOT_ROUTE).not.toContain("dangerouslySetInnerHTML")
  })
})
