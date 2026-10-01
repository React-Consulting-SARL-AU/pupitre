import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import {
  CODE_SIGNING_ENTITY,
  copyrightHolder,
  LEGAL_CONTACTS,
  LEGAL_DOCUMENT_SLUGS,
  LEGAL_DOCUMENTS,
  LEGAL_ENTITY,
} from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import { checkLegalPages } from "../../scripts/legal"
import { LOCALES } from "../lib/i18n"

const ROOT = "src/content/legal"

const FORGOTTEN_OFFERS_RE =
  /free launch|lancement gratuit|launch seat|for good|pour de bon|the trial|l’essai|merchant of record/i

function page(locale: string, slug: string): string {
  return path.join(ROOT, locale, `${slug}.mdx`)
}

function read(locale: string, slug: string): string {
  return readFileSync(page(locale, slug), "utf8")
}

describe("les pages légales", () => {
  it("existent dans les deux langues pour chaque document du contrat partagé", () => {
    for (const locale of LOCALES) {
      for (const document of LEGAL_DOCUMENTS) {
        expect(existsSync(page(locale, document.slug)), document.slug).toBe(
          true
        )
      }
    }
  })

  it("portent l'ordre et la date que le contrat partagé leur donne", () => {
    for (const locale of LOCALES) {
      for (const document of LEGAL_DOCUMENTS) {
        const content = read(locale, document.slug)

        expect(content, document.slug).toContain(`order: ${document.order}`)
        expect(content, document.slug).toContain(`updated: ${document.updated}`)
      }
    }
  })

  it("ne sont plus des brouillons et ne laissent aucun passage à compléter", () => {
    expect(checkLegalPages(process.cwd())).toEqual([])
  })

  it("ne revendiquent aucune forme juridique qui n'existe pas", () => {
    for (const locale of LOCALES) {
      for (const document of LEGAL_DOCUMENTS) {
        const content = read(locale, document.slug)

        expect(content, document.slug).not.toContain("LLC")
        expect(content, document.slug).not.toContain("Inc.")
      }
    }
  })

  it("nomment la société qui édite, concède le code et signe l'app", () => {
    const publisher = copyrightHolder()

    expect(publisher).toBe(LEGAL_ENTITY.legalName)
    for (const locale of LOCALES) {
      for (const slug of ["terms", "licence", "privacy", "data-processing"]) {
        expect(read(locale, slug), slug).toContain(publisher)
      }

      expect(read(locale, "licence")).toContain(CODE_SIGNING_ENTITY.name)
    }
  })

  it("donnent la licence du code et renvoient à son texte dans le dépôt", () => {
    for (const locale of LOCALES) {
      const licence = read(locale, "licence")

      expect(licence, locale).toContain("Apache")
      expect(licence, locale).toContain("Commons Clause")
      expect(licence, locale).toContain("href={SOURCE_LICENSE_URL}")
    }
  })

  it("ne promettent plus de lancement, d'essai ni de place gardée pour de bon", () => {
    for (const locale of LOCALES) {
      for (const document of LEGAL_DOCUMENTS) {
        if (document.slug === "changes") {
          continue
        }

        expect(read(locale, document.slug), document.slug).not.toMatch(
          FORGOTTEN_OFFERS_RE
        )
      }
    }
  })

  it("nomment l'éditeur, le directeur de la publication et la société qui signe dans les mentions légales", () => {
    for (const locale of LOCALES) {
      const notice = read(locale, "legal-notice")

      expect(notice).toContain(copyrightHolder())
      expect(notice).toContain(CODE_SIGNING_ENTITY.name)
      for (const field of [
        "legalName",
        "owner",
        "publicationDirector",
        "registeredAddress",
        "registrationNumber",
        "ice",
        "taxId",
        "professionalTax",
      ] as const) {
        expect(LEGAL_ENTITY[field], field).not.toBeNull()
        expect(notice, field).toContain(`{LEGAL_ENTITY.${field}}`)
      }

      for (const contact of Object.values(LEGAL_CONTACTS)) {
        expect(notice, contact).toContain(contact)
      }
    }
  })

  it("donnent l'adresse de contact que le contrat partagé déclare", () => {
    for (const locale of LOCALES) {
      expect(read(locale, "terms")).toContain(LEGAL_CONTACTS.legal)
      expect(read(locale, "privacy")).toContain(LEGAL_CONTACTS.privacy)
      expect(read(locale, "acceptable-use")).toContain(LEGAL_CONTACTS.support)
      expect(read(locale, "billing")).toContain(LEGAL_CONTACTS.support)
      expect(read(locale, "security")).toContain(LEGAL_CONTACTS.security)
    }
  })

  it("ne renvoient qu'à des documents qui existent, dans leur propre langue", () => {
    const slugs = new Set<string>(LEGAL_DOCUMENT_SLUGS)

    for (const locale of LOCALES) {
      const prefix = locale === "fr" ? "/fr/legal/" : "/legal/"

      for (const document of LEGAL_DOCUMENTS) {
        const links = read(locale, document.slug).matchAll(
          /\]\((\/(?:fr\/)?legal\/)([^/)]+)\/\)/g
        )

        for (const [, base, slug] of links) {
          expect(base, `${locale}/${document.slug}`).toBe(prefix)
          expect(slugs.has(slug), `${locale}/${document.slug} → ${slug}`).toBe(
            true
          )
        }
      }
    }
  })

  it("nomment les sous-traitants par le contrat partagé, jamais à la main", () => {
    for (const locale of LOCALES) {
      for (const slug of ["privacy", "data-processing", "sub-processors"]) {
        expect(read(locale, slug), slug).toContain("<SubProcessors />")
      }
    }
  })
})
