import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { checkLegalDrafts, isProduction, LEGAL_DIR } from "./legal"

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "pupitre-legal-"))

  mkdirSync(path.join(root, LEGAL_DIR, "en"), { recursive: true })

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, LEGAL_DIR, "en", name), content)
  }

  return root
}

const READY = `---
title: "Terms"
draft: false
---

Binding wording.
`

describe("isProduction", () => {
  it("recognises the production build of the site and nothing else", () => {
    expect(isProduction({ PUPITRE_ENV: "production" })).toBe(true)
    expect(isProduction({ CF_PAGES_BRANCH: "main" })).toBe(true)
    expect(isProduction({ CF_PAGES_BRANCH: "feat/MKT-07" })).toBe(false)
    expect(isProduction({})).toBe(false)
  })
})

describe("checkLegalDrafts", () => {
  it("finds a TODO left in a legal page", () => {
    const root = fixture({ "terms.mdx": "## Who we are\n\nTODO — pending.\n" })

    expect(checkLegalDrafts(root)).toEqual([
      {
        file: path.join(LEGAL_DIR, "en", "terms.mdx"),
        reason: "legal TODO left",
      },
    ])
  })

  it("finds a page still marked draft even without a TODO", () => {
    const root = fixture({ "terms.mdx": "---\ndraft: true\n---\n\nText.\n" })

    expect(checkLegalDrafts(root)[0].reason).toBe("still marked draft")
  })

  it("says nothing about a page the owner has signed off", () => {
    expect(checkLegalDrafts(fixture({ "terms.mdx": READY }))).toEqual([])
  })

  it("says nothing when there is no legal directory", () => {
    expect(
      checkLegalDrafts(mkdtempSync(path.join(tmpdir(), "empty-")))
    ).toEqual([])
  })
})
