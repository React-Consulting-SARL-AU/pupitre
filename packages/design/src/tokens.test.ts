import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { YAML } from "bun"
import { DARK, LIGHT, type ThemeColors } from "./tokens"

const DESIGN_DOC = path.resolve(
  import.meta.dir,
  "../../../docs/product/DESIGN.md"
)
const TOKENS_CSS = path.resolve(import.meta.dir, "tokens.css")
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/

interface Frontmatter {
  colors: { light: Record<string, string>; dark: Record<string, string> }
  radius: Record<string, string>
  motion: Record<string, string>
}

function readFrontmatter(): Frontmatter {
  const match = readFileSync(DESIGN_DOC, "utf8").match(FRONTMATTER_RE)

  if (!match) {
    throw new Error("DESIGN.md has no frontmatter")
  }

  return YAML.parse(match[1]) as Frontmatter
}

function cssBlock(css: string, selector: string): string {
  const start = css.indexOf(selector)

  if (start === -1) {
    throw new Error(`tokens.css has no "${selector}" block`)
  }

  return css.slice(start, css.indexOf("}", start))
}

const frontmatter = readFrontmatter()
const css = readFileSync(TOKENS_CSS, "utf8")

const THEME_BLOCKS: ["light" | "dark", string][] = [
  ["light", ":root {"],
  ["dark", ':root[data-theme="dark"] {'],
  ["dark", ':root:not([data-theme="light"]) {'],
]

describe("tokens.css", () => {
  for (const [theme, selector] of THEME_BLOCKS) {
    describe(selector, () => {
      const block = cssBlock(css, selector)

      for (const [name, value] of Object.entries(frontmatter.colors[theme])) {
        it(`declares --${name}: ${value}`, () => {
          expect(block).toContain(`--${name}: ${value};`)
        })
      }
    })
  }

  it("guards the media query behind the explicit light choice", () => {
    expect(css).toContain(
      '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {'
    )
  })

  for (const [name, value] of Object.entries(frontmatter.radius)) {
    it(`declares --radius-${name}: ${value}`, () => {
      expect(css).toContain(`--radius-${name}: ${value};`)
    })
  }

  for (const [name, value] of Object.entries(frontmatter.motion)) {
    it(`declares --motion-${name}: ${value}`, () => {
      expect(css).toContain(`--motion-${name}: ${value};`)
    })
  }
})

describe("tokens.ts", () => {
  const RECORDS: ["light" | "dark", ThemeColors][] = [
    ["light", LIGHT],
    ["dark", DARK],
  ]

  for (const [theme, record] of RECORDS) {
    it(`mirrors the ${theme} palette of DESIGN.md`, () => {
      expect(record).toEqual(
        frontmatter.colors[theme] as unknown as ThemeColors
      )
    })
  }
})
