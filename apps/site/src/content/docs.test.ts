import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { MODULE_IDS } from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import { LOCALES } from "../lib/i18n"
import { DOCS_SECTIONS } from "./site/docs"
import { MODULE_DOCS } from "./site/module-docs"

const ROOTS = {
  docs: "src/content/docs",
  blog: "src/content/blog",
  changelog: "src/content/changelog",
  legal: "src/content/legal",
} as const

function pagesOf(root: string, locale: string): string[] {
  const dir = path.join(root, locale)

  if (!existsSync(dir)) {
    return []
  }

  const walk = (current: string, prefix = ""): string[] =>
    readdirSync(current, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(current, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`]
    )

  return walk(dir).sort()
}

function frontmatter(file: string): Record<string, string> {
  const raw = readFileSync(file, "utf8")
  const block = raw.split("---")[1] ?? ""

  return Object.fromEntries(
    block
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => {
        const [key, ...rest] = line.split(":")

        return [key.trim(), rest.join(":").trim().replace(/^"|"$/g, "")]
      })
  )
}

describe("every collection", () => {
  it("holds the same pages in both languages", () => {
    for (const root of Object.values(ROOTS)) {
      const [en, fr] = LOCALES.map((locale) => pagesOf(root, locale))

      expect(en.length, root).toBeGreaterThan(0)
      expect(fr.length, root).toBe(en.length)
    }
  })

  it("declares the locale of the folder it sits in", () => {
    for (const root of Object.values(ROOTS)) {
      for (const locale of LOCALES) {
        for (const page of pagesOf(root, locale)) {
          const data = frontmatter(path.join(root, locale, page))

          expect(data.locale, `${root}/${locale}/${page}`).toBe(locale)
          expect(data.title, `${root}/${locale}/${page}`).toBeTruthy()
          expect(data.description, `${root}/${locale}/${page}`).toBeTruthy()
        }
      }
    }
  })
})

describe("the documentation", () => {
  it("puts every page in a declared section", () => {
    for (const locale of LOCALES) {
      for (const page of pagesOf(ROOTS.docs, locale)) {
        const data = frontmatter(path.join(ROOTS.docs, locale, page))

        expect(DOCS_SECTIONS, page).toContain(data.section)
        expect(page.startsWith(`${data.section}/`), page).toBe(true)
      }
    }
  })

  it("opens with choosing a VPS in both languages", () => {
    for (const locale of LOCALES) {
      const pages = pagesOf(ROOTS.docs, locale)

      expect(pages, locale).toContain("start/vps.mdx")
    }
  })
})

describe("the service catalogue", () => {
  it("documents every module of the contract, and what each one asks for", () => {
    expect(Object.keys(MODULE_DOCS).sort()).toEqual([...MODULE_IDS].sort())

    for (const id of MODULE_IDS) {
      const doc = MODULE_DOCS[id]

      expect(doc.installs.length, id).toBeGreaterThan(0)
      for (const line of [...doc.installs, ...doc.asks]) {
        for (const locale of LOCALES) {
          expect(line[locale], `${id} ${locale}`).toBeTruthy()
        }
      }
    }
  })
})
