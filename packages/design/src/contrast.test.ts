import { describe, expect, it } from "bun:test"
import { DARK, LIGHT, type ThemeColors } from "./tokens"

const CHANNEL = 255
const LOW = 0.039_28
const SLOPE = 12.92
const OFFSET = 0.055
const SCALE = 1.055
const GAMMA = 2.4
const GLARE = 0.05

const WEIGHTS = { blue: 0.0722, green: 0.7152, red: 0.2126 }

const READABLE = 4.5

// Enough only for a mark that is also said in words or in a shape.
const LARGE = 3

function channel(value: number): number {
  const linear = value / CHANNEL

  return linear <= LOW ? linear / SLOPE : ((linear + OFFSET) / SCALE) ** GAMMA
}

function luminance(hex: string): number {
  const value = hex.replace("#", "")
  const read = (at: number) =>
    channel(Number.parseInt(value.slice(at, at + 2), 16))

  return (
    WEIGHTS.red * read(0) + WEIGHTS.green * read(2) + WEIGHTS.blue * read(4)
  )
}

function contrast(front: string, back: string): number {
  const [light, dark] = [luminance(front), luminance(back)].sort(
    (left, right) => right - left
  ) as [number, number]

  return (light + GLARE) / (dark + GLARE)
}

const THEMES: Record<string, ThemeColors> = { clair: LIGHT, sombre: DARK }

const TEXT_SURFACES = ["base", "surface", "sunken"] as const

// Hover, a highlighted row, a menu entry: a passing state, never a page.
const RAISED = "raised"

const SURFACES = [...TEXT_SURFACES, RAISED] as const

interface Floors {
  onText: number
  onRaised: number
}

const INK_FLOORS: Record<string, Floors> = {
  ink: { onText: READABLE, onRaised: READABLE },
  "ink-2": { onText: READABLE, onRaised: READABLE },
  "ink-3": { onText: READABLE, onRaised: READABLE },
  // `ink-4` is for placeholders and what is disabled, said another way too.
  "ink-4": { onText: LARGE, onRaised: LARGE },
  ok: { onText: READABLE, onRaised: LARGE },
  warn: { onText: READABLE, onRaised: LARGE },
  danger: { onText: READABLE, onRaised: LARGE },
  frost: { onText: READABLE, onRaised: LARGE },
}

function floorOf(floors: Floors, surface: string): number {
  return surface === RAISED ? floors.onRaised : floors.onText
}

describe("token contrast", () => {
  it("measures the WCAG formula on the two extremes", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1)
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5)
  })

  for (const [theme, colors] of Object.entries(THEMES)) {
    it(`${theme} theme: each ink holds its floor`, () => {
      const short: string[] = []

      for (const [ink, floors] of Object.entries(INK_FLOORS)) {
        for (const surface of SURFACES) {
          const floor = floorOf(floors, surface)
          const ratio = Number(
            contrast(
              colors[ink as keyof ThemeColors],
              colors[surface as keyof ThemeColors]
            ).toFixed(2)
          )

          if (ratio < floor) {
            short.push(
              `${ink} sur ${surface} : ${ratio}:1 au lieu de ${floor}:1`
            )
          }
        }
      }

      expect(short).toEqual([])
    })

    it(`${theme} theme: the inverse ink reads on the primary button`, () => {
      expect(
        contrast(colors["inverse-ink"], colors.inverse)
      ).toBeGreaterThanOrEqual(READABLE)
    })
  }
})
