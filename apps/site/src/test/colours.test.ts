import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const SOURCE_RE = /\.(ts|astro|css)$/
const TEST_RE = /\.test\.ts$/

// `color-mix(in srgb, var(--base), …)` and `currentColor` are not colours of their own.
const HAND_WRITTEN_COLOUR =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      sources(full, out)
    } else if (SOURCE_RE.test(entry.name) && !TEST_RE.test(entry.name)) {
      out.push(full)
    }
  }

  return out
}

describe("the site never paints a colour of its own", () => {
  it("writes no colour by hand anywhere in its sources", () => {
    const root = path.resolve(import.meta.dirname, "..")
    const files = sources(root)

    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n")

      for (const [index, line] of lines.entries()) {
        expect(
          line,
          `${path.relative(root, file)}:${index + 1} writes a colour instead of a token from @pupitre/design`
        ).not.toMatch(HAND_WRITTEN_COLOUR)
      }
    }
  })
})
