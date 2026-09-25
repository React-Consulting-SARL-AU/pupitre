import { readFileSync } from "node:fs"
import path from "node:path"
import satori from "satori"

// Outlines, not live text: the lockups render the same on a machine without Bricolage Grotesque.
const FONT = path.join(import.meta.dir, "fonts/bricolage-grotesque-700.ttf")
const WORD = "Pupitre"
// Big enough that rounding the outlines to three decimals costs nothing.
const EM = 1000
const TRACKING = -0.01 * EM

const PATH_RE = /<path[^>]*\bd="([^"]+)"[^>]*\/>/g
const MASK_RE = /<mask[\s\S]*?<\/mask>/g
const COMMAND_RE = /([MLQCZ])([^MLQCZ]*)/gi
const NUMBER_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi
const CURVE_STEPS = 24

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface Wordmark {
  paths: string[]
  // Baseline to cap height, descenders excluded: what a lockup aligns on.
  cap: Box
  ink: Box
}

async function outlines(word: string): Promise<string[]> {
  const node = {
    type: "div",
    props: {
      style: {
        display: "flex",
        fontFamily: "Display",
        fontSize: EM,
        fontWeight: 700,
        letterSpacing: TRACKING,
        color: "#000000",
      },
      children: word,
    },
  }

  // The plain object Satori reads from a React element: this package has no JSX runtime.
  const svg = await satori(node as never, {
    width: EM * 8,
    height: EM * 2,
    embedFont: true,
    fonts: [
      {
        name: "Display",
        data: readFileSync(FONT),
        weight: 700,
        style: "normal",
      },
    ],
  })

  return [...svg.replace(MASK_RE, "").matchAll(PATH_RE)].map(
    (match) => match[1]
  )
}

function sample(
  from: [number, number],
  control: [number, number][],
  to: [number, number],
  out: [number, number][]
): void {
  const points = [from, ...control, to]

  for (let step = 1; step <= CURVE_STEPS; step++) {
    const t = step / CURVE_STEPS
    let current = points

    while (current.length > 1) {
      const next: [number, number][] = []
      for (let i = 0; i < current.length - 1; i++) {
        next.push([
          current[i][0] + (current[i + 1][0] - current[i][0]) * t,
          current[i][1] + (current[i + 1][1] - current[i][1]) * t,
        ])
      }
      current = next
    }

    out.push(current[0])
  }
}

function points(d: string): [number, number][] {
  const out: [number, number][] = []
  let cursor: [number, number] = [0, 0]

  for (const [, command, rest] of d.matchAll(COMMAND_RE)) {
    const numbers = [...rest.matchAll(NUMBER_RE)].map((match) =>
      Number(match[0])
    )

    if (command === "M" || command === "L") {
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        cursor = [numbers[i], numbers[i + 1]]
        out.push(cursor)
      }
    } else if (command === "Q") {
      for (let i = 0; i + 3 < numbers.length; i += 4) {
        const to: [number, number] = [numbers[i + 2], numbers[i + 3]]
        sample(cursor, [[numbers[i], numbers[i + 1]]], to, out)
        cursor = to
      }
    } else if (command === "C") {
      for (let i = 0; i + 5 < numbers.length; i += 6) {
        const to: [number, number] = [numbers[i + 4], numbers[i + 5]]
        sample(
          cursor,
          [
            [numbers[i], numbers[i + 1]],
            [numbers[i + 2], numbers[i + 3]],
          ],
          to,
          out
        )
        cursor = to
      }
    }
  }

  return out
}

function box(paths: string[]): Box {
  const all = paths.flatMap(points)
  const xs = all.map(([x]) => x)
  const ys = all.map(([, y]) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)

  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

let cached: Wordmark | undefined

export async function wordmark(): Promise<Wordmark> {
  if (!cached) {
    const word = await outlines(WORD)
    // The capital P alone spans cap height to baseline, with no descender in the way.
    const capital = box(await outlines("P"))
    const ink = box(word)

    cached = {
      paths: word,
      cap: {
        x: ink.x,
        y: capital.y,
        width: ink.width,
        height: capital.height,
      },
      ink,
    }
  }

  return cached
}
