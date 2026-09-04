import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { YAML } from "bun"
import {
  DARK,
  type Elevation,
  LIGHT,
  MOTION,
  RADIUS,
  SHADOW_DARK,
  SHADOW_LIGHT,
  SPACE,
  type ThemeColors,
  TYPOGRAPHY,
} from "./tokens"

const DESIGN_DOC = path.resolve(
  import.meta.dir,
  "../../../docs/product/DESIGN.md"
)
const TOKENS_CSS = path.resolve(import.meta.dir, "tokens.css")
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/
const SPACE_SCALE_RE = /^(\d+)px base, steps ([\d\s]+)$/
const NUMBER_RE = /\d*\.\d+|\d+/g
const KEBAB_RE = /[A-Z]/g
const FONT_PREFIX_RE = /^font-/
const WHITESPACE_RE = /\s+/

interface Frontmatter {
  colors: { light: Record<string, string>; dark: Record<string, string> }
  typography: Record<string, Record<string, string | number>>
  radius: Record<string, string>
  space: { scale: string; gutter: string; section: string }
  elevation: Record<string, string>
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

/** The CSS formatter is free to respace, requote and pad decimals; only the value matters. */
function normalize(value: string): string {
  return value
    .replaceAll("'", "")
    .replaceAll('"', "")
    .replace(/\s+/g, "")
    .replace(NUMBER_RE, (number) => String(Number(number)))
}

function declares(css: string, name: string, value: string): boolean {
  return normalize(css).includes(normalize(`--${name}:${value};`))
}

function spaceSteps(scale: string): { base: number; steps: number[] } {
  const match = scale.match(SPACE_SCALE_RE)

  if (!match) {
    throw new Error(`Unreadable space scale: ${scale}`)
  }

  return {
    base: Number(match[1]),
    steps: match[2].trim().split(WHITESPACE_RE).map(Number),
  }
}

const frontmatter = readFrontmatter()
const css = readFileSync(TOKENS_CSS, "utf8")
const { base, steps } = spaceSteps(frontmatter.space.scale)

const THEME_BLOCKS: ["light" | "dark", string][] = [
  ["light", ":root {"],
  ["dark", ':root[data-theme="dark"] {'],
  ["dark", ':root:not([data-theme="light"]) {'],
]

const DARK_SHADOWS: Record<string, string> = {
  raised: "raised-dark",
  overlay: "overlay-dark",
}

describe("tokens.css", () => {
  for (const [theme, selector] of THEME_BLOCKS) {
    describe(selector, () => {
      const block = cssBlock(css, selector)

      for (const [name, value] of Object.entries(frontmatter.colors[theme])) {
        it(`declares --${name}: ${value}`, () => {
          expect(declares(block, name, value)).toBe(true)
        })
      }

      if (theme === "dark") {
        for (const [name, source] of Object.entries(DARK_SHADOWS)) {
          it(`redeclares --shadow-${name} with the ${source} elevation`, () => {
            expect(
              declares(block, `shadow-${name}`, frontmatter.elevation[source])
            ).toBe(true)
          })
        }
      }
    })
  }

  it("guards the media query behind the explicit light choice", () => {
    expect(css).toContain(
      '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {'
    )
  })

  for (const [group, entries] of Object.entries(frontmatter.typography)) {
    for (const [property, value] of Object.entries(entries)) {
      const suffix = property
        .replace(KEBAB_RE, (letter) => `-${letter.toLowerCase()}`)
        .replace(FONT_PREFIX_RE, "")
      const name =
        property === "fontFamily" ? `font-${group}` : `font-${group}-${suffix}`

      it(`declares --${name}`, () => {
        expect(declares(css, name, String(value))).toBe(true)
      })
    }
  }

  for (const [name, value] of Object.entries(frontmatter.radius)) {
    it(`declares --radius-${name}: ${value}`, () => {
      expect(declares(css, `radius-${name}`, value)).toBe(true)
    })
  }

  for (const step of steps) {
    it(`declares --space-${step}: ${step * base}px`, () => {
      expect(declares(css, `space-${step}`, `${step * base}px`)).toBe(true)
    })
  }

  for (const name of ["gutter", "section"] as const) {
    it(`declares --space-${name}: ${frontmatter.space[name]}`, () => {
      expect(declares(css, `space-${name}`, frontmatter.space[name])).toBe(true)
    })
  }

  for (const name of ["flat", "raised", "overlay"] as const) {
    it(`declares --shadow-${name}`, () => {
      expect(declares(css, `shadow-${name}`, frontmatter.elevation[name])).toBe(
        true
      )
    })
  }

  for (const [name, value] of Object.entries(frontmatter.motion)) {
    it(`declares --motion-${name}: ${value}`, () => {
      expect(declares(css, `motion-${name}`, value)).toBe(true)
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

  it("mirrors the typography of DESIGN.md", () => {
    expect(TYPOGRAPHY).toEqual(
      frontmatter.typography as unknown as typeof TYPOGRAPHY
    )
  })

  it("mirrors the radii of DESIGN.md", () => {
    expect(RADIUS).toEqual(frontmatter.radius as unknown as typeof RADIUS)
  })

  it("mirrors the motion durations of DESIGN.md", () => {
    expect(MOTION).toEqual(frontmatter.motion as unknown as typeof MOTION)
  })

  it("mirrors the space scale of DESIGN.md", () => {
    const expected: Record<string, string> = {
      gutter: frontmatter.space.gutter,
      section: frontmatter.space.section,
    }

    for (const step of steps) {
      expected[step] = `${step * base}px`
    }

    expect(SPACE).toEqual(expected as unknown as typeof SPACE)
  })

  it("mirrors the light elevation of DESIGN.md", () => {
    expect(SHADOW_LIGHT).toEqual({
      flat: frontmatter.elevation.flat,
      raised: frontmatter.elevation.raised,
      overlay: frontmatter.elevation.overlay,
    } as Elevation)
  })

  it("mirrors the dark elevation of DESIGN.md", () => {
    expect(SHADOW_DARK).toEqual({
      flat: frontmatter.elevation.flat,
      raised: frontmatter.elevation["raised-dark"],
      overlay: frontmatter.elevation["overlay-dark"],
    } as Elevation)
  })
})
