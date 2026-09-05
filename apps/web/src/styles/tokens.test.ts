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

/** The scale `@pupitre/design` exposes, and nothing beside it. */
const RADIUS_TOKEN_RE = /--radius-([a-z0-9]+)\s*:/g

/**
 * A radius written by hand: an arbitrary Tailwind value, a `borderRadius`
 * style, or a CSS declaration. None of them can follow a token when the scale
 * moves, which is exactly what the site's tightening asked of the console.
 */
const ARBITRARY_RADIUS_RE = /\brounded(?:-[a-z]+)*-\[/
const INLINE_RADIUS_RE = /\bborderRadius\b|border-radius\s*:/

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

describe("les rayons de la console", () => {
  const scale = radiusScale()
  const files = sources(SOURCE_ROOT)

  it("lit la même échelle que @pupitre/design", () => {
    expect([...scale].sort()).toEqual(["full", "lg", "md", "sm", "xl"])
  })

  it("balaie toutes les sources", () => {
    expect(files.length).toBeGreaterThan(SOURCES_AT_LEAST)
  })

  it("n'écrit aucun rayon à la main", () => {
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

  it("ne prend aucune classe d'arrondi hors de l'échelle", () => {
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
