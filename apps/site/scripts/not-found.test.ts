import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { flattenNotFoundPages } from "./not-found"

let dist: string

function write(relative: string, content: string): void {
  const file = path.join(dist, relative)

  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

beforeEach(() => {
  dist = mkdtempSync(path.join(tmpdir(), "pupitre-dist-"))
})

afterEach(() => {
  rmSync(dist, { recursive: true, force: true })
})

describe("flattenNotFoundPages", () => {
  it("puts the French 404 where the assets layer looks for it", () => {
    write("404.html", '<html lang="en">')
    write("fr/404/index.html", '<html lang="fr">')

    expect(flattenNotFoundPages(dist)).toEqual(["fr/404.html"])
    expect(readFileSync(path.join(dist, "fr/404.html"), "utf8")).toBe(
      '<html lang="fr">'
    )
    expect(existsSync(path.join(dist, "fr/404"))).toBe(false)
    expect(readFileSync(path.join(dist, "404.html"), "utf8")).toBe(
      '<html lang="en">'
    )
  })

  it("does nothing on a tree already flat", () => {
    write("fr/404.html", '<html lang="fr">')

    expect(flattenNotFoundPages(dist)).toEqual([])
    expect(existsSync(path.join(dist, "fr/404.html"))).toBe(true)
  })
})
