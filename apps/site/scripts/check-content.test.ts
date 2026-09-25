import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  checkBannedWords,
  checkBlogTranslations,
  checkContent,
  checkRouteParity,
} from "./check-content"

let root: string

function write(relative: string, content = ""): void {
  const file = path.join(root, relative)

  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "pupitre-site-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("route parity", () => {
  it("accepts a tree where every page exists in both languages", () => {
    write("src/pages/index.astro")
    write("src/pages/pricing.astro")
    write("src/pages/docs/[...slug].astro")
    write("src/pages/fr/index.astro")
    write("src/pages/fr/pricing.astro")
    write("src/pages/fr/docs/[...slug].astro")

    expect(checkRouteParity(root)).toEqual([])
  })

  it("reports an English page without its French twin, and the reverse", () => {
    write("src/pages/index.astro")
    write("src/pages/pricing.astro")
    write("src/pages/fr/index.astro")
    write("src/pages/fr/download.astro")

    const findings = checkRouteParity(root)

    expect(findings).toHaveLength(2)
    expect(findings).toContainEqual({
      file: "src/pages/pricing.astro",
      reason: "missing French twin src/pages/fr/pricing.astro",
    })
    expect(findings).toContainEqual({
      file: "src/pages/fr/download.astro",
      reason: "missing English twin src/pages/download.astro",
    })
  })

  it("ignores non-route files", () => {
    write("src/pages/index.astro")
    write("src/pages/fr/index.astro")
    write("src/pages/_shared.ts")
    write("src/pages/fr/_shared.ts")
    write("src/pages/index.test.ts")

    expect(checkRouteParity(root)).toEqual([])
  })
})

describe("banned words", () => {
  it("flags each banned word in src/content and src/pages, case-insensitively", () => {
    write("src/content/ui/en.ts", 'export const en = { a: "Seamless setup" }')
    write("src/pages/index.astro", "<p>AI-Powered and blazing fast</p>")
    write("src/pages/fr/index.astro", "<p>Une sécurité bank-grade</p>")
    write("src/lib/voice.ts", 'export const BANNED_WORDS = ["seamless"]')

    const findings = checkBannedWords(root)

    expect(findings).toEqual([
      { file: "src/content/ui/en.ts", reason: 'banned word "seamless"' },
      { file: "src/pages/fr/index.astro", reason: 'banned word "bank-grade"' },
      { file: "src/pages/index.astro", reason: 'banned word "AI-powered"' },
      { file: "src/pages/index.astro", reason: 'banned word "blazing"' },
    ])
  })

  it("accepts clean content", () => {
    write("src/content/ui/en.ts", 'export const en = { a: "SSH ed25519" }')
    write("src/pages/index.astro", "<p>tmux, PostgreSQL 17</p>")

    expect(checkBannedWords(root)).toEqual([])
  })
})

function post(locale: string, slug: string, translation?: string): void {
  const line = translation ? `translation: ${translation}\n` : ""

  write(
    `src/content/blog/${locale}/${slug}.mdx`,
    `---\ntitle: T\n${line}---\n\nBody.\n`
  )
}

describe("blog translations", () => {
  it("accepts posts that name each other across languages", () => {
    post("en", "on-a-vps", "sur-un-vps")
    post("fr", "sur-un-vps", "on-a-vps")

    expect(checkBlogTranslations(root)).toEqual([])
  })

  it("reports a missing, a dangling and a one-way translation", () => {
    post("en", "silent")
    post("en", "dangling", "nowhere")
    post("en", "one-way", "aller")
    post("fr", "aller", "somewhere-else")

    expect(
      checkBlogTranslations(root).map((finding) => finding.reason)
    ).toEqual([
      'translation "nowhere" has no post in fr',
      'its fr translation "aller" does not point back to "one-way"',
      "no `translation` in the frontmatter",
      'translation "somewhere-else" has no post in en',
    ])
  })
})

describe("checkContent", () => {
  it("combines parity and banned-word findings", () => {
    write("src/pages/index.astro", "<p>revolutionary</p>")

    const findings = checkContent(root)

    expect(findings.map((finding) => finding.reason)).toEqual([
      "missing French twin src/pages/fr/index.astro",
      'banned word "revolutionary"',
    ])
  })
})
