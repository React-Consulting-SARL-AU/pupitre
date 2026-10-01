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
  it("est la société qui concède la licence du code, avec ses identifiants publiés", () => {
    expect(LegalEntitySchema.parse(LEGAL_ENTITY)).toEqual(LEGAL_ENTITY)
    expect(LEGAL_ENTITY.status).toBe("incorporated")
    expect(isIncorporated()).toBe(true)
    expect(LEGAL_ENTITY.legalName).toBe("React Consulting SARL AU")
    expect(LEGAL_ENTITY.jurisdiction).toBe("Morocco")
    expect(LEGAL_ENTITY.publicationDirector).toBe(LEGAL_ENTITY.owner)
    expect(LEGAL_ENTITY.registrationNumber).toBe("144445")
    expect(LEGAL_ENTITY.taxId).toBe("60198624")
    expect(LEGAL_ENTITY.ice).toBe("003399449000060")
    expect(LEGAL_ENTITY.professionalTax).toBe("45112803")
    expect(LEGAL_ENTITY.registeredAddress).toContain("40000 Marrakech")
  })

  it("détient les droits du code, la société qui signe aussi l'app", () => {
    expect(copyrightHolder()).toBe("React Consulting SARL AU")
    expect(copyrightHolder()).toBe(CODE_SIGNING_ENTITY.name)
  })

  it("rend les droits à la personne tant qu'aucune société n'est immatriculée", () => {
    const individual = {
      ...LEGAL_ENTITY,
      status: "individual" as const,
      legalName: null,
    }

    expect(isIncorporated(individual)).toBe(false)
    expect(copyrightHolder(individual)).toBe("Jordan Monier")
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
    const named = {
      ...LEGAL_ENTITY,
      status: "individual" as const,
      legalName: "Pupitre Inc.",
    }

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
