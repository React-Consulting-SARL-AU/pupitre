import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { LEGAL_ENTITY } from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import { checkLegalDrafts, isProduction, LEGAL_DIR, legalDrafts } from "./legal"

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "pupitre-legal-"))

  mkdirSync(path.join(root, LEGAL_DIR, "en"), { recursive: true })

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, LEGAL_DIR, "en", name), content)
  }

  return root
}

const OPEN = {
  stage: "public" as const,
  entity: { ...LEGAL_ENTITY, status: "incorporated" as const },
}

const DRAFT = `---
title: "Terms"
draft: true
---

Working draft, [name to be completed at incorporation].
`

const READY = `---
title: "Terms"
draft: false
---

Binding wording, see the [licence](/legal/licence/).
`

describe("isProduction", () => {
  it("recognises the production build of the site and nothing else", () => {
    expect(isProduction({ PUPITRE_ENV: "production" })).toBe(true)
    expect(isProduction({ CF_PAGES_BRANCH: "main" })).toBe(true)
    expect(isProduction({ CF_PAGES_BRANCH: "feat/legal" })).toBe(false)
    expect(isProduction({})).toBe(false)
  })
})

describe("checkLegalDrafts", () => {
  it("finds a TODO left in a legal page, whatever the stage", () => {
    const root = fixture({ "terms.mdx": "## Who we are\n\nTODO — pending.\n" })

    expect(checkLegalDrafts(root)).toEqual([
      {
        file: path.join(LEGAL_DIR, "en", "terms.mdx"),
        reason: "legal TODO left",
      },
    ])
  })

  it("lets a draft through while the project is in development", () => {
    expect(checkLegalDrafts(fixture({ "terms.mdx": DRAFT }))).toEqual([])
  })

  it("refuses a draft once the project is open", () => {
    const root = fixture({ "terms.mdx": DRAFT })

    expect(checkLegalDrafts(root, OPEN)[0].reason).toBe("still marked draft")
  })

  it("refuses a placeholder once the project is open", () => {
    const signed = DRAFT.replace("draft: true", "draft: false")
    const root = fixture({ "terms.mdx": signed })

    expect(checkLegalDrafts(root, OPEN)[0].reason).toBe("placeholder left")
  })

  it("does not take a Markdown link for a placeholder", () => {
    expect(checkLegalDrafts(fixture({ "terms.mdx": READY }), OPEN)).toEqual([])
  })

  it("refuses to open the project before the publisher exists", () => {
    const root = fixture({ "terms.mdx": READY })

    expect(checkLegalDrafts(root, { stage: "public" })).toEqual([
      {
        file: "@pupitre/shared/legal",
        reason: "project opened while the publisher is not incorporated",
      },
    ])
  })

  it("says nothing when there is no legal directory", () => {
    expect(
      checkLegalDrafts(mkdtempSync(path.join(tmpdir(), "empty-")))
    ).toEqual([])
  })
})

describe("legalDrafts", () => {
  it("lists the pages that still carry the draft flag", () => {
    const root = fixture({ "terms.mdx": DRAFT, "licence.mdx": READY })

    expect(legalDrafts(root)).toEqual([path.join(LEGAL_DIR, "en", "terms.mdx")])
  })
})
