import { describe, expect, it } from "bun:test"
import { LOCALES } from "../i18n/locale"
import {
  copyrightHolder,
  developmentNotice,
  isIncorporated,
  isPublicStage,
  LEGAL_DOCUMENT_SLUGS,
  LEGAL_DOCUMENTS,
  LEGAL_ENTITY,
  LegalDocumentSchema,
  LegalEntitySchema,
  PROJECT_STAGE,
  SUB_PROCESSORS,
  SubProcessorSchema,
} from "./index"

describe("l'éditeur", () => {
  it("est décrit par un objet valide, sans identité inventée", () => {
    expect(LegalEntitySchema.parse(LEGAL_ENTITY)).toEqual(LEGAL_ENTITY)
    expect(isIncorporated()).toBe(false)
    expect(LEGAL_ENTITY.legalName).toBeNull()
    expect(LEGAL_ENTITY.registeredAddress).toBeNull()
  })

  it("appartient à une personne tant que la société n'existe pas", () => {
    expect(LEGAL_ENTITY.owner).toBe("Jordan Monier")
    expect(copyrightHolder()).toBe("Jordan Monier")
  })

  it("passe les droits à la société dès qu'elle est immatriculée", () => {
    const incorporated = {
      ...LEGAL_ENTITY,
      status: "incorporated" as const,
      legalName: "Pupitre Inc.",
    }

    expect(isIncorporated(incorporated)).toBe(true)
    expect(copyrightHolder(incorporated)).toBe("Pupitre Inc.")
  })

  it("garde la personne tant que la société n'a pas de nom légal", () => {
    const named = { ...LEGAL_ENTITY, legalName: "Pupitre Inc." }

    expect(copyrightHolder(named)).toBe("Jordan Monier")
  })
})

describe("l'étape du projet", () => {
  it("est le développement, donc rien n'est public", () => {
    expect(PROJECT_STAGE).toBe("development")
    expect(isPublicStage()).toBe(false)
    expect(isPublicStage("public")).toBe(true)
  })
})

describe("l'avis de développement", () => {
  it("tient en une ligne de bandeau dans chaque langue, et dit la même chose", () => {
    expect(developmentNotice("fr").banner).toContain(
      "en cours de développement"
    )
    expect(developmentNotice("en").banner).toContain("under development")
    expect(developmentNotice("fr").banner.length).toBeLessThan(120)
    expect(developmentNotice("en").banner.length).toBeLessThan(120)
  })
})

describe("les documents légaux", () => {
  it("couvrent les cinq slugs, une fois chacun, dans l'ordre", () => {
    const slugs = LEGAL_DOCUMENTS.map((document) => document.slug)

    expect(slugs).toEqual([...LEGAL_DOCUMENT_SLUGS])
    expect(LEGAL_DOCUMENTS.map((document) => document.order)).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  it("sont tous des brouillons tant que le projet est en développement", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(LegalDocumentSchema.parse(document)).toEqual(document)
      expect(document.status).toBe("draft")
    }
  })
})

describe("les sous-traitants", () => {
  it("nomment leur rôle et leur région dans les deux langues", () => {
    expect(SUB_PROCESSORS.length).toBeGreaterThan(0)
    for (const processor of SUB_PROCESSORS) {
      expect(SubProcessorSchema.parse(processor)).toEqual(processor)
    }
  })
})

describe("l'avertissement de développement", () => {
  it("existe dans chaque langue et dit que rien n'engage", () => {
    for (const locale of LOCALES) {
      const notice = developmentNotice(locale)

      expect(notice.title.length).toBeGreaterThan(0)
      expect(notice.body.length).toBeGreaterThan(0)
      expect(notice.entity).toContain(LEGAL_ENTITY.owner)
      expect(notice.short.length).toBeGreaterThan(0)
    }
  })
})
