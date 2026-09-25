import { describe, expect, it } from "bun:test"
import {
  CODE_SIGNING_ENTITY,
  copyrightHolder,
  isBlockedAttachment,
  isIncorporated,
  isPreviewableMailType,
  LEGAL_DOCUMENT_SLUGS,
  LEGAL_DOCUMENTS,
  LEGAL_ENTITY,
  LegalDocumentSchema,
  LegalEntitySchema,
  MAIL_BLOCKED_ATTACHMENT_EXTENSIONS,
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_MAX_OUTBOUND_ATTACHMENTS,
  MAIL_SIGNED_URL_TTL_SECONDS,
  SUB_PROCESSORS,
  SubProcessorSchema,
} from "./index"

describe("l'éditeur", () => {
  it("est une personne identifiée, sans identité de société inventée", () => {
    expect(LegalEntitySchema.parse(LEGAL_ENTITY)).toEqual(LEGAL_ENTITY)
    expect(LEGAL_ENTITY.status).toBe("individual")
    expect(isIncorporated()).toBe(false)
    expect(LEGAL_ENTITY.jurisdiction).toBe("Morocco")
    expect(LEGAL_ENTITY.publicationDirector).toBe(LEGAL_ENTITY.owner)
    expect(LEGAL_ENTITY.legalName).toBeNull()
    expect(LEGAL_ENTITY.registeredAddress).toBeNull()
  })

  it("appartient à une personne tant que la société n'existe pas", () => {
    expect(LEGAL_ENTITY.owner).toBe("Jordan Monier")
    expect(copyrightHolder()).toBe("Jordan Monier")
  })

  it("nomme la société qui signe l'app, distincte de l'éditeur", () => {
    expect(CODE_SIGNING_ENTITY.name).toBe("React Consulting SARL AU")
    expect(CODE_SIGNING_ENTITY.name).not.toBe(copyrightHolder())
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

describe("les documents légaux", () => {
  it("couvrent chaque slug, une fois chacun, dans l'ordre", () => {
    const slugs = LEGAL_DOCUMENTS.map((document) => document.slug)

    expect(slugs).toEqual([...LEGAL_DOCUMENT_SLUGS])
    expect(LEGAL_DOCUMENTS.map((document) => document.order)).toEqual(
      LEGAL_DOCUMENT_SLUGS.map((_, index) => index + 1)
    )
  })

  it("portent chacun une date valide", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(LegalDocumentSchema.parse(document)).toEqual(document)
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

  it("ne nomment que ceux qui touchent une donnée personnelle", () => {
    const names = SUB_PROCESSORS.map((processor) => processor.name)

    expect(names).toContain("Cloudflare, Inc.")
    expect(names).toContain("PostHog, Inc.")
    expect(names).not.toContain("GitHub")
  })
})

describe("les pièces jointes sortantes", () => {
  it("tiennent en cinq mébioctets, dix pièces et dix minutes d'adresse signée", () => {
    expect(MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024)
    expect(MAIL_MAX_OUTBOUND_ATTACHMENTS).toBe(10)
    expect(MAIL_SIGNED_URL_TTL_SECONDS).toBe(600)
  })

  it("refusent un exécutable ou un script, quelle que soit la casse", () => {
    expect(isBlockedAttachment("rapport.exe")).toBe(true)
    expect(isBlockedAttachment("Installer.MSI")).toBe(true)
    expect(isBlockedAttachment("script.ps1")).toBe(true)
    expect(isBlockedAttachment("archive.tar.sh")).toBe(true)
    expect(isBlockedAttachment("rapport.pdf")).toBe(false)
    expect(isBlockedAttachment("sans-extension")).toBe(false)
    expect(MAIL_BLOCKED_ATTACHMENT_EXTENSIONS).toContain("js")
  })

  it("ne s'affichent en ligne que pour une image matricielle ou un PDF", () => {
    expect(isPreviewableMailType("image/png")).toBe(true)
    expect(isPreviewableMailType("IMAGE/JPEG; charset=binary")).toBe(true)
    expect(isPreviewableMailType("application/pdf")).toBe(true)
    expect(isPreviewableMailType("image/svg+xml")).toBe(false)
    expect(isPreviewableMailType("text/html")).toBe(false)
    expect(isPreviewableMailType(null)).toBe(false)
  })
})
