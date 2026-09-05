import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { LOCALES } from "@pupitre/shared/i18n"
import { en } from "./en"
import { fr } from "./fr"
import { translator } from "./i18n"

const SOURCE_ROOT = path.resolve(import.meta.dir, "../..")
const I18N_DIR = path.resolve(import.meta.dir)
const SOURCE_RE = /\.tsx?$/
const TEST_RE = /\.test\.tsx?$/
const PLACEHOLDER_RE = /\{(\w+)\}/g
const ONE_SUFFIX_RE = /\.one$/
const LITERAL_RE = /"([^"\n]{4,})"/g

/** An accented letter is the tell: the console was written in French first. */
const FRENCH_RE = /[éèêëàâçùûôîïœ]/i

/**
 * Files that legitimately carry text with no reader: server-side error codes
 * and the workflow trigger, which answers a machine.
 */
const NOT_INTERFACE = new Set(["src/workflows/internal-trigger.ts"])

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (full !== I18N_DIR) {
        sources(full, out)
      }
    } else if (SOURCE_RE.test(entry.name) && !TEST_RE.test(entry.name)) {
      out.push(full)
    }
  }

  return out
}

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER_RE)].map((match) => match[1]).sort()
}

describe("le dictionnaire", () => {
  it("porte les mêmes clés dans les deux langues", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
  })

  it("ne laisse aucune chaîne vide", () => {
    for (const [locale, dictionary] of [
      ["en", en],
      ["fr", fr],
    ] as const) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), `${locale} ${key}`).not.toBe("")
      }
    }
  })

  it("garde les mêmes paramètres d'une langue à l'autre", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(fr[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it("donne un singulier et un pluriel à chaque phrase qui compte", () => {
    const counted = Object.keys(en).filter((key) => key.endsWith(".one"))

    expect(counted.length).toBeGreaterThan(0)
    for (const key of counted) {
      expect(Object.keys(en)).toContain(key.replace(ONE_SUFFIX_RE, ".other"))
    }
  })

  it("accorde le pluriel selon la règle de chaque langue", () => {
    const fr0 = translator("fr")
    const en0 = translator("en")

    expect(fr0.plural("billing.seat", 1)).toBe("1 serveur")
    expect(fr0.plural("billing.seat", 2)).toBe("2 serveurs")
    expect(en0.plural("billing.seat", 1)).toBe("1 server")
    expect(en0.plural("billing.seat", 2)).toBe("2 servers")
  })

  it("expose la langue qu'il parle", () => {
    for (const locale of LOCALES) {
      expect(translator(locale).locale).toBe(locale)
    }
  })
})

describe("la console", () => {
  it("n'écrit plus aucune phrase française hors du dictionnaire", () => {
    const offenders: string[] = []

    for (const file of sources(SOURCE_ROOT)) {
      const relative = path.relative(path.resolve(SOURCE_ROOT, ".."), file)

      if (NOT_INTERFACE.has(relative)) {
        continue
      }

      const text = readFileSync(file, "utf8")
      const literals = [...text.matchAll(LITERAL_RE)].map((match) => match[1])

      if (literals.some((literal) => FRENCH_RE.test(literal))) {
        offenders.push(relative)
      }
    }

    expect(offenders).toEqual([])
  })
})
