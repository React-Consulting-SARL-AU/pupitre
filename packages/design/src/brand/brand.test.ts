import { describe, expect, it } from "bun:test"
import { COMPACT, glyphSvg, MARK, markSvg, ON_DARK, ON_LIGHT } from "."

const HEX_RE = /#[0-9a-f]{3,8}/g
const PALETTE = new Set([ON_LIGHT.square, ON_LIGHT.glyph, ON_DARK.square])

function inked(grow = 1, weight = 1) {
  const centre = MARK.grid / 2
  const cap = (MARK.stroke * weight * grow) / 2
  const at = (value: number) => centre + (value - centre) * grow

  return {
    left: at(300) - cap,
    right: at(724) + cap,
    top: at(364) - cap,
    bottom: at(660) + cap,
  }
}

describe("the brand", () => {
  it("centres the glyph in its square, caps included", () => {
    const box = inked()

    expect(box.left + box.right).toBe(MARK.grid)
    expect(box.top + box.bottom).toBe(MARK.grid)
  })

  it("keeps the small optical size centred and inside the square", () => {
    const box = inked(COMPACT.glyph, COMPACT.stroke)

    expect(box.left + box.right).toBeCloseTo(MARK.grid, 6)
    expect(box.top + box.bottom).toBeCloseTo(MARK.grid, 6)
    expect(box.left).toBeGreaterThan(0)
    expect(box.right).toBeLessThan(MARK.grid)
  })

  it("draws the small size bolder than the normal one, never the reverse", () => {
    const normal = inked()
    const small = inked(COMPACT.glyph, COMPACT.stroke)

    expect(small.right - small.left).toBeGreaterThan(normal.right - normal.left)
    expect(COMPACT.stroke).toBeGreaterThan(1)
  })

  it("uses only the palette's black and white", () => {
    const svgs = [
      markSvg({ colors: ON_LIGHT }),
      markSvg({ colors: ON_DARK }),
      markSvg({ adaptive: true }),
      glyphSvg(ON_LIGHT.square),
    ]

    for (const svg of svgs) {
      for (const hex of svg.match(HEX_RE) ?? []) {
        expect(PALETTE).toContain(hex)
      }
    }
  })

  it("lets the favicon follow the reader's theme", () => {
    const svg = markSvg({ adaptive: true })

    expect(svg).toContain("prefers-color-scheme: dark")
    expect(svg).toContain(`fill: ${ON_DARK.square}`)
    expect(svg).not.toContain(`fill="${ON_LIGHT.square}"`)
  })

  it("sets the square on the macOS grid when asked", () => {
    const svg = markSvg({ inset: 100, radius: 185 })

    expect(svg).toContain('x="100" y="100" width="824" height="824" rx="185"')
    expect(svg).toContain("scale(0.805)")
  })

  it("outputs a standalone document, not a fragment", () => {
    expect(markSvg()).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(markSvg()).toContain("<title>Pupitre</title>")
  })
})
