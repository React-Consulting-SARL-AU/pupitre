import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SOURCE_ROOT = path.resolve(import.meta.dir, "..")
const CONSOLE_ROOT = path.resolve(SOURCE_ROOT, "..")
const SOURCE_RE = /\.(tsx?|css)$/
const TEST_RE = /\.test\.tsx?$/
const GENERATED = new Set(["routeTree.gen.ts"])
const SOURCES_AT_LEAST = 100

const TAILWIND_CSS = fileURLToPath(
  import.meta.resolve("@pupitre/design/tailwind.css")
)

const RADIUS_TOKEN_RE = /--radius-([a-z0-9]+)\s*:/g

// A hand-written radius cannot follow the token scale when it moves.
const ARBITRARY_RADIUS_RE = /\brounded(?:-[a-z]+)*-\[/
const INLINE_RADIUS_RE = /\bborderRadius\b|border-radius\s*:/

const ARBITRARY_MOTION_RE = /\bduration-\[|\bease-\[/

// `ink-4` does not reach 4.5:1 contrast: placeholders and disabled states only.
const INK_4_RE = /(?:[a-z-]+:)*text-ink-4/g
const STATE_VARIANT_RE = /(?:placeholder|disabled):/

const ROUNDED_CLASS_RE =
  /\brounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?(?:-([a-z0-9]+))?\b/g

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      sources(full, out)
    } else if (
      SOURCE_RE.test(entry.name) &&
      !TEST_RE.test(entry.name) &&
      !GENERATED.has(entry.name)
    ) {
      out.push(full)
    }
  }

  return out
}

function radiusScale(): Set<string> {
  const css = readFileSync(TAILWIND_CSS, "utf8")

  return new Set(
    [...css.matchAll(RADIUS_TOKEN_RE)].map((match) => match[1].toLowerCase())
  )
}

function offendingLines(
  text: string,
  offends: (line: string) => string | null
): string[] {
  return text
    .split("\n")
    .map((line, index) => {
      const reason = offends(line)

      return reason ? `${index + 1}: ${reason}` : null
    })
    .filter((entry): entry is string => entry !== null)
}

describe("the console radii", () => {
  const scale = radiusScale()
  const files = sources(SOURCE_ROOT)

  it("reads the same scale as @pupitre/design", () => {
    expect([...scale].sort()).toEqual(["full", "lg", "md", "sm", "xl", "xs"])
  })

  it("sweeps all the sources", () => {
    expect(files.length).toBeGreaterThan(SOURCES_AT_LEAST)
  })

  it("writes no duration or curve by hand", () => {
    const offenders: string[] = []

    for (const file of files) {
      const relative = path.relative(CONSOLE_ROOT, file)
      const found = offendingLines(readFileSync(file, "utf8"), (line) =>
        ARBITRARY_MOTION_RE.test(line)
          ? "a duration or an easing instead of a utility from @pupitre/design"
          : null
      )

      offenders.push(...found.map((entry) => `${relative}:${entry}`))
    }

    expect(offenders).toEqual([])
  })

  it("writes no radius by hand", () => {
    const offenders: string[] = []

    for (const file of files) {
      const relative = path.relative(CONSOLE_ROOT, file)
      const found = offendingLines(readFileSync(file, "utf8"), (line) => {
        if (ARBITRARY_RADIUS_RE.test(line)) {
          return "an arbitrary radius instead of a class from the scale"
        }

        if (INLINE_RADIUS_RE.test(line)) {
          return "a radius declared by hand instead of a class from the scale"
        }

        return null
      })

      offenders.push(...found.map((entry) => `${relative}:${entry}`))
    }

    expect(offenders).toEqual([])
  })

  it("takes no rounding class outside the scale", () => {
    const offenders: string[] = []

    for (const file of files) {
      const relative = path.relative(CONSOLE_ROOT, file)

      for (const match of readFileSync(file, "utf8").matchAll(
        ROUNDED_CLASS_RE
      )) {
        const step = match[1]

        if (!(step && scale.has(step))) {
          offenders.push(`${relative}: ${match[0]}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

describe("the console inks", () => {
  const files = sources(SOURCE_ROOT)

  it("sets text-ink-4 only on a placeholder or a disabled element", () => {
    const offenders: string[] = []

    for (const file of files) {
      const relative = path.relative(CONSOLE_ROOT, file)

      for (const match of readFileSync(file, "utf8").matchAll(INK_4_RE)) {
        if (!STATE_VARIANT_RE.test(match[0])) {
          offenders.push(`${relative}: ${match[0]}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
