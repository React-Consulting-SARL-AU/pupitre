import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { checkLegalPages, isProduction, LEGAL_DIR } from "./legal"

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "pupitre-legal-"))

  mkdirSync(path.join(root, LEGAL_DIR, "en"), { recursive: true })

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, LEGAL_DIR, "en", name), content)
  }

  return root
}

const TERMS = path.join(LEGAL_DIR, "en", "terms.mdx")

const DRAFT = `---
title: "Terms"
draft: true
---

Working draft, [name to be completed at incorporation].
`

const READY = `---
title: "Terms"
---

Binding wording, see the [licence](/legal/licence/).
`

describe("isProduction", () => {
  it("recognises the production build of the site and nothing else", () => {
    expect(isProduction({ PUPITRE_ENV: "production" })).toBe(true)
    expect(isProduction({ PUPITRE_ENV: "staging" })).toBe(false)
    expect(isProduction({})).toBe(false)
  })
})

describe("checkLegalPages", () => {
  it("finds a TODO left in a legal page", () => {
    const root = fixture({ "terms.mdx": "## Who we are\n\nTODO — pending.\n" })

    expect(checkLegalPages(root)).toEqual([
      { file: TERMS, reason: "legal TODO left" },
    ])
  })

  it("refuses a page still marked draft", () => {
    expect(checkLegalPages(fixture({ "terms.mdx": DRAFT }))).toEqual([
      { file: TERMS, reason: "still marked draft" },
    ])
  })

  it("refuses a placeholder left in a page", () => {
    const unsigned = DRAFT.replace("draft: true\n", "")

    expect(checkLegalPages(fixture({ "terms.mdx": unsigned }))).toEqual([
      { file: TERMS, reason: "placeholder left" },
    ])
  })

  it("does not take a Markdown link for a placeholder", () => {
    expect(checkLegalPages(fixture({ "terms.mdx": READY }))).toEqual([])
  })

  it("says nothing when there is no legal directory", () => {
    expect(checkLegalPages(mkdtempSync(path.join(tmpdir(), "empty-")))).toEqual(
      []
    )
  })
})
