import { describe, expect, it } from "bun:test"
import { COMPACT, glyphSvg, MARK, markSvg, ON_DARK, ON_LIGHT } from "."

const HEX_RE = /#[0-9a-f]{3,8}/g
const PALETTE = new Set([ON_LIGHT.square, ON_LIGHT.glyph, ON_DARK.square])

/** What the glyph inks, round caps included. */
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

describe("la marque", () => {
  it("centre le glyphe dans son carré, capuchons compris", () => {
    const box = inked()

    expect(box.left + box.right).toBe(MARK.grid)
    expect(box.top + box.bottom).toBe(MARK.grid)
  })

  it("garde la petite taille optique centrée et à l'intérieur du carré", () => {
    const box = inked(COMPACT.glyph, COMPACT.stroke)

    expect(box.left + box.right).toBeCloseTo(MARK.grid, 6)
    expect(box.top + box.bottom).toBeCloseTo(MARK.grid, 6)
    expect(box.left).toBeGreaterThan(0)
    expect(box.right).toBeLessThan(MARK.grid)
  })

  it("dessine la petite taille plus grosse que la normale, jamais l'inverse", () => {
    const normal = inked()
    const small = inked(COMPACT.glyph, COMPACT.stroke)

    expect(small.right - small.left).toBeGreaterThan(normal.right - normal.left)
    expect(COMPACT.stroke).toBeGreaterThan(1)
  })

  it("n'emploie que le noir et le blanc de la palette", () => {
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

  it("laisse le favicon suivre le thème du lecteur", () => {
    const svg = markSvg({ adaptive: true })

    expect(svg).toContain("prefers-color-scheme: dark")
    expect(svg).toContain(`fill: ${ON_DARK.square}`)
    expect(svg).not.toContain(`fill="${ON_LIGHT.square}"`)
  })

  it("pose le carré sur la grille macOS quand on le lui demande", () => {
    const svg = markSvg({ inset: 100, radius: 185 })

    expect(svg).toContain('x="100" y="100" width="824" height="824" rx="185"')
    expect(svg).toContain("scale(0.805)")
  })

  it("sort un document autonome, pas un fragment", () => {
    expect(markSvg()).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(markSvg()).toContain("<title>Pupitre</title>")
  })
})
