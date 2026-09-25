import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const FONT_DIR = import.meta.dir
const STYLESHEET = path.join(FONT_DIR, "fonts.css")
const NOTICE = path.join(FONT_DIR, "NOTICE.md")
const LICENCES = [
  ["OFL.txt", "The Bricolage Grotesque Project Authors"],
  ["OFL-JetBrainsMono.txt", "The JetBrains Mono Project Authors"],
] as const
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

  it("n'embarque que les graisses que les titres et les données demandent", () => {
    const weights = [...stylesheet().matchAll(/font-weight:\s*([\d ]+);/g)].map(
      (match) => match[1]
    )

    expect(weights).toEqual(["700", "100 800"])
  })

  it("n'échange jamais la police sous les yeux du lecteur", () => {
    const displays = [...stylesheet().matchAll(/font-display:\s*(\w+)/g)].map(
      (match) => match[1]
    )

    expect(displays.length).toBe(declaredFiles().length)
    for (const display of displays) {
      expect(display).toBe("block")
    }
  })

  it("garde les licences et la provenance dans le dépôt", () => {
    const notice = readFileSync(NOTICE, "utf8")

    for (const [file, authors] of LICENCES) {
      const licence = readFileSync(path.join(FONT_DIR, file), "utf8")

      expect(licence).toContain("SIL Open Font License, Version 1.1")
      expect(licence).toContain(authors)
      expect(notice).toContain(file)
    }
    expect(notice).toContain("SIL OFL 1.1")

    for (const file of declaredFiles()) {
      expect(notice).toContain(file)
    }
  })
})
