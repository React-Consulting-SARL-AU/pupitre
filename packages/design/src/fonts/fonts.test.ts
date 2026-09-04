import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const FONT_DIR = import.meta.dir
const STYLESHEET = path.join(FONT_DIR, "fonts.css")
const NOTICE = path.join(FONT_DIR, "NOTICE.md")
const LICENCE = path.join(FONT_DIR, "OFL.txt")
const SOURCE_RE = /url\("\.\/([^"]+)"\)/g
const WOFF2_SIGNATURE = "wOF2"

function stylesheet(): string {
  return readFileSync(STYLESHEET, "utf8")
}

function declaredFiles(): string[] {
  return [...stylesheet().matchAll(SOURCE_RE)].map((match) => match[1])
}

describe("la police d'affichage", () => {
  it("est servie depuis le dépôt et jamais depuis Internet", () => {
    expect(stylesheet()).not.toContain("http")

    const files = declaredFiles()

    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(existsSync(path.join(FONT_DIR, file))).toBe(true)
    }
  })

  it("embarque un woff2 en sous-ensemble latin", () => {
    for (const file of declaredFiles()) {
      const full = path.join(FONT_DIR, file)

      expect(readFileSync(full).subarray(0, 4).toString("latin1")).toBe(
        WOFF2_SIGNATURE
      )
      // A latin subset weighs tens of kilobytes; the whole variable family
      // weighs hundreds, and shipping it would mean nobody checked.
      expect(statSync(full).size).toBeLessThan(80_000)
    }
  })

  it("n'embarque que la graisse que les titres demandent", () => {
    const weights = [...stylesheet().matchAll(/font-weight:\s*(\d+)/g)].map(
      (match) => match[1]
    )

    expect(weights).toEqual(["700"])
  })

  it("garde sa licence et sa provenance dans le dépôt", () => {
    const licence = readFileSync(LICENCE, "utf8")
    const notice = readFileSync(NOTICE, "utf8")

    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1")
    expect(licence).toContain("The Bricolage Grotesque Project Authors")
    expect(notice).toContain("SIL OFL 1.1")

    for (const file of declaredFiles()) {
      expect(notice).toContain(file)
    }
  })
})
