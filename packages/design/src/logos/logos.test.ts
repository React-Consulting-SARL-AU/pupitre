import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { MODULE_IDS, type ModuleId } from "@pupitre/shared/catalog"
import { EXEMPTIONS, LOGOS, logoFor, MARKS, markFor } from "./index"

const LOGO_DIR = import.meta.dir
const NOTICE = path.join(LOGO_DIR, "NOTICE.md")
const NOTICE_FILE_RE = /^\|\s*`([^`]+\.svg)`\s*\|/gm
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
const VIEWBOX_RE = /\bviewBox="[-\d.\s]+"/
const SIZE_ATTRIBUTE_RE = /\s(width|height)=/
const ROOT_TAG_RE = /<svg\b[^>]*>/
const FORBIDDEN = [
  "<script",
  "<image",
  "<foreignObject",
  "<style",
  "<use",
  "http://",
  "https://",
]

function fileOf(moduleId: ModuleId): string {
  return `${moduleId.replaceAll(".", "-")}.svg`
}

function markFileOf(id: string): string {
  return `mark-${id}.svg`
}

function logoOfFile(file: string) {
  const moduleId = Object.keys(LOGOS).find(
    (candidate) => fileOf(candidate as ModuleId) === file
  )

  if (moduleId) {
    return LOGOS[moduleId as ModuleId]
  }

  return MARKS[
    Object.keys(MARKS).find((candidate) => markFileOf(candidate) === file) ?? ""
  ]
}

function svgFiles(): string[] {
  return readdirSync(LOGO_DIR)
    .filter((entry) => entry.endsWith(".svg"))
    .sort()
}

function noticeFiles(): string[] {
  const listed = readFileSync(NOTICE, "utf8").matchAll(NOTICE_FILE_RE)

  return [...listed].map((match) => match[1]).sort()
}

// Well-formedness, not validation: balanced tags and the number of roots.
function xmlRoots(markup: string): string[] {
  const stack: string[] = []
  const roots: string[] = []

  for (const [, closing, name, , selfClosing] of markup.matchAll(TAG_RE)) {
    if (closing) {
      if (stack.pop() !== name) {
        throw new Error(`Unbalanced </${name}>`)
      }

      continue
    }

    if (stack.length === 0) {
      roots.push(name)
    }

    if (!selfClosing) {
      stack.push(name)
    }
  }

  if (stack.length > 0) {
    throw new Error(`Unclosed <${stack.at(-1)}>`)
  }

  return roots
}

const files = svgFiles()

describe("catalogue coverage", () => {
  for (const id of MODULE_IDS) {
    it(`${id} has a logo or a declared exemption`, () => {
      const hasLogo = Boolean(LOGOS[id])
      const hasExemption = Boolean(EXEMPTIONS[id])

      expect(hasLogo || hasExemption).toBe(true)
      expect(hasLogo && hasExemption).toBe(false)
    })
  }

  it("names every logo file after its module id, every mark after its brand", () => {
    const expected = [
      ...Object.keys(LOGOS).map((id) => fileOf(id as ModuleId)),
      ...Object.keys(MARKS).map(markFileOf),
    ].sort()

    expect(files).toEqual(expected)
  })

  it("inlines the markup its file holds", () => {
    for (const file of files) {
      const onDisk = readFileSync(path.join(LOGO_DIR, file), "utf8")

      expect(logoOfFile(file)?.svg).toBe(onDisk.trim())
    }
  })

  it("returns null for a module without a logo", () => {
    expect(logoFor("core.system")).toBeNull()
    expect(logoFor("tool.github")).not.toBeNull()
  })

  it("serves a brand the catalogue does not name", () => {
    expect(markFor("bun")).not.toBeNull()
    expect(markFor("runtime.node")).toBeNull()
  })
})

describe("NOTICE.md", () => {
  it("covers exactly the files of src/logos", () => {
    expect(noticeFiles()).toEqual(files)
  })

  it("states the nominative use", () => {
    expect(readFileSync(NOTICE, "utf8")).toContain("Nominative use")
  })
})

describe.each(files)("%s", (file) => {
  const markup = readFileSync(path.join(LOGO_DIR, file), "utf8")

  for (const needle of FORBIDDEN) {
    it(`contains no ${needle}`, () => {
      expect(markup.toLowerCase()).not.toContain(needle.toLowerCase())
    })
  }

  it("is a single well-formed <svg> root", () => {
    expect(xmlRoots(markup)).toEqual(["svg"])
  })

  it("carries a viewBox and no fixed size", () => {
    const root = markup.match(ROOT_TAG_RE)?.[0] ?? ""

    expect(root).toMatch(VIEWBOX_RE)
    expect(root).not.toMatch(SIZE_ATTRIBUTE_RE)
  })

  it("takes its colour from the theme only when monochrome", () => {
    const logo = logoOfFile(file) as { monochrome: boolean }

    expect(markup.includes("currentColor")).toBe(logo.monochrome)
  })
})
