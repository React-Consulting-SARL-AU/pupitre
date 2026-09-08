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
const SOURCES_AT_LEAST = 100
const PLACEHOLDER_RE = /\{(\w+)\}/g
const ONE_SUFFIX_RE = /\.one$/

const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g
const LINE_COMMENT_RE = /(^|[^:"'`\\])\/\/[^\n]*/gm

/** Quoted, backtick-quoted, and the bare text a JSX element wraps. */
const QUOTED_RE = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g
const TEMPLATE_RE = /`((?:[^`\\]|\\.)*)`/g
const TEMPLATE_HOLE_RE = /\$\{[^{}]*\}/g
const JSX_TEXT_RE = />([^<>{}]+)</g

/**
 * The loud tells: an accented letter, the quotation marks the console uses,
 * or an elided article — `l'`, `d'`, `qu'`.
 */
const FRENCH_MARK_RE =
  /[éèêëàâäçùûüôöîïœæ]|[«»]|\b(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu)['’]/i

/** A sentence can be French with no accent at all, so count its grammar too. */
const FRENCH_WORD_RE =
  /\b(?:le|la|les|un|une|des|du|au|aux|est|sont|dans|pour|avec|sans|plus|vous|votre|vos|cette|cet|aucun|aucune|qui|que|pas|par|sur|son|ses|leur|leurs|nous|notre|encore|toujours|trop|donc|mais)\b/gi

const FRENCH_WORDS_AT_LEAST = 2

function looksFrench(literal: string): boolean {
  if (FRENCH_MARK_RE.test(literal)) {
    return true
  }

  const words = new Set(
    [...literal.matchAll(FRENCH_WORD_RE)].map((match) => match[0].toLowerCase())
  )

  return words.size >= FRENCH_WORDS_AT_LEAST
}

/**
 * The one file that legitimately carries French with no reader: the internal
 * workflow trigger, whose bodies answer a machine, never a person.
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

function withoutComments(text: string): string {
  return text
    .replace(BLOCK_COMMENT_RE, " ")
    .replace(LINE_COMMENT_RE, (_match, before: string) => before)
}

/**
 * Everything a reader could end up seeing: quoted strings, the fixed parts of
 * a template literal, and the text a JSX element wraps. The gap between the
 * first two is how a hard-coded sentence once reached the revoke dialog.
 */
function readableText(source: string): string[] {
  const text = withoutComments(source)
  const found: string[] = []

  for (const match of text.matchAll(QUOTED_RE)) {
    found.push(match[1] ?? match[2] ?? "")
  }

  for (const match of text.matchAll(TEMPLATE_RE)) {
    found.push(match[1].replace(TEMPLATE_HOLE_RE, " "))
  }

  for (const match of text.matchAll(JSX_TEXT_RE)) {
    found.push(match[1])
  }

  return found
}

describe("la console", () => {
  it("n'écrit plus aucune phrase française hors du dictionnaire", () => {
    const offenders: string[] = []
    const scanned: string[] = []

    for (const file of sources(SOURCE_ROOT)) {
      const relative = path.relative(path.resolve(SOURCE_ROOT, ".."), file)

      if (NOT_INTERFACE.has(relative)) {
        continue
      }

      scanned.push(relative)

      for (const literal of readableText(readFileSync(file, "utf8"))) {
        if (looksFrench(literal)) {
          offenders.push(`${relative}: ${literal.trim()}`)
        }
      }
    }

    expect(scanned.length).toBeGreaterThan(SOURCES_AT_LEAST)
    expect(offenders).toEqual([])
  })

  it("lit les gabarits et le texte JSX, pas seulement les guillemets doubles", () => {
    const planted = [
      `const a = \`« \${name} » n'ouvrira plus de session.\``,
      "const b = <p>Réessayez dans un instant.</p>",
      "const c = 'Aucune clé enregistrée.'",
      'const d = "Votre session est trop ancienne."',
    ]

    for (const source of planted) {
      expect(
        readableText(source).some((literal) => looksFrench(literal)),
        source
      ).toBe(true)
    }
  })

  it("ne prend pas un commentaire ni un chemin pour une phrase", () => {
    const source = [
      "// la langue vient du cookie",
      "/** Le pied de page est global. */",
      'const url = "https://pupitre.studio/legal"',
    ].join("\n")

    expect(
      readableText(source).filter((literal) => looksFrench(literal))
    ).toEqual([])
  })
})
