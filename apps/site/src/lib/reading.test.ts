import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { readingMinutes, readingTime } from "./reading"

const BLOG_DIR = fileURLToPath(new URL("../content/blog", import.meta.url))
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n/
const MINUTES_RE = /^4\smin$/

function words(count: number): string {
  return Array.from({ length: count }, () => "word").join(" ")
}

describe("reading time", () => {
  it("counts a minute per 230 words, rounded up", () => {
    expect(readingMinutes(words(230))).toBe(1)
    expect(readingMinutes(words(231))).toBe(2)
    expect(readingMinutes(words(721))).toBe(4)
  })

  it("never says zero", () => {
    expect(readingMinutes("")).toBe(1)
  })

  it("leaves imports, tags and code out of the count", () => {
    const body = [
      'import Callout from "../../components/Callout.astro"',
      "",
      words(10),
      '<Callout heading="x">',
      "```bash",
      words(500),
      "```",
      "</Callout>",
    ].join("\n")

    expect(readingMinutes(body)).toBe(1)
  })

  it("writes the duration in each language", () => {
    expect(readingTime(words(700), "en")).toMatch(MINUTES_RE)
    expect(readingTime(words(700), "fr")).toMatch(MINUTES_RE)
  })

  it("gives every post of the blog a few minutes, not a quarter of an hour", () => {
    for (const locale of readdirSync(BLOG_DIR)) {
      for (const file of readdirSync(path.join(BLOG_DIR, locale))) {
        const body = readFileSync(path.join(BLOG_DIR, locale, file), "utf8")

        expect(
          readingMinutes(body.replace(FRONTMATTER_RE, "")),
          file
        ).toBeLessThanOrEqual(5)
      }
    }
  })
})
