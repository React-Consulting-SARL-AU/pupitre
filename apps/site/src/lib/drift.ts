import { STACK, type StackItem } from "../content/site/home"

export type DriftPlace = "hero" | "cta"

export interface Drift {
  item: StackItem
  side: "start" | "end"
  top: number
  out: number
  size: "sm" | "lg"
  lift: number
  seconds: number
  delay: number
}

interface Position extends Omit<Drift, "item"> {
  name: string
}

/**
 * Where each logo sits: `top` as a share of the block it flanks, `out` as the
 * distance in rem from the middle of the page to the near edge of the tile.
 * Measured from the middle rather than from the window, so a wide screen never
 * pushes the constellation away from the column of text. The ten services of
 * the wall are split between the two ends of the page and none is shown twice.
 */
const POSITIONS: Record<DriftPlace, readonly Position[]> = {
  hero: [
    {
      name: "Claude Code",
      side: "start",
      top: 9,
      out: 35,
      size: "lg",
      lift: 0.9,
      seconds: 13,
      delay: 240,
    },
    {
      name: "Hermes",
      side: "start",
      top: 32,
      out: 35,
      size: "lg",
      lift: 0.8,
      seconds: 17,
      delay: 300,
    },
    {
      name: "PostgreSQL",
      side: "start",
      top: 55,
      out: 27,
      size: "sm",
      lift: 0.7,
      seconds: 16,
      delay: 360,
    },
    {
      name: "Docker",
      side: "start",
      top: 78,
      out: 26,
      size: "lg",
      lift: 1,
      seconds: 18,
      delay: 420,
    },
    {
      name: "Codex",
      side: "end",
      top: 13,
      out: 35,
      size: "lg",
      lift: 0.8,
      seconds: 15,
      delay: 280,
    },
    {
      name: "Cloudflare",
      side: "end",
      top: 36,
      out: 36,
      size: "sm",
      lift: 0.9,
      seconds: 12,
      delay: 340,
    },
    {
      name: "Node.js",
      side: "end",
      top: 58,
      out: 28,
      size: "lg",
      lift: 0.9,
      seconds: 11,
      delay: 400,
    },
    {
      name: "Python",
      side: "end",
      top: 80,
      out: 24,
      size: "sm",
      lift: 0.7,
      seconds: 16,
      delay: 460,
    },
  ],
  cta: [
    {
      name: "Bun",
      side: "start",
      top: 18,
      out: 31,
      size: "lg",
      lift: 0.9,
      seconds: 15,
      delay: 0,
    },
    {
      name: "Java",
      side: "start",
      top: 62,
      out: 27,
      size: "sm",
      lift: 0.7,
      seconds: 16,
      delay: 0,
    },
    {
      name: "MySQL",
      side: "end",
      top: 22,
      out: 32,
      size: "lg",
      lift: 0.8,
      seconds: 13,
      delay: 0,
    },
    {
      name: "Redis",
      side: "end",
      top: 66,
      out: 28,
      size: "sm",
      lift: 0.9,
      seconds: 17,
      delay: 0,
    },
  ],
}

export function driftFor(place: DriftPlace): Drift[] {
  return POSITIONS[place].map(({ name, ...position }) => {
    const item = STACK.find((entry) => entry.name === name)

    if (!item) {
      throw new Error(`${name} floats beside the ${place} but is not in STACK`)
    }

    return { item, ...position }
  })
}
