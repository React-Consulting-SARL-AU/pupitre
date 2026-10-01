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

describe("the publisher", () => {
  it("is the company that grants the code licence, with its published identifiers", () => {
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

  it("holds the code rights, the company that also signs the app", () => {
    expect(copyrightHolder()).toBe("React Consulting SARL AU")
    expect(copyrightHolder()).toBe(CODE_SIGNING_ENTITY.name)
  })

  it("gives the rights to the individual as long as no company is registered", () => {
    const individual = {
      ...LEGAL_ENTITY,
      status: "individual" as const,
      legalName: null,
    }

    expect(isIncorporated(individual)).toBe(false)
    expect(copyrightHolder(individual)).toBe("Jordan Monier")
  })

  it("passes the rights to the company as soon as it is registered", () => {
    const incorporated = {
      ...LEGAL_ENTITY,
      status: "incorporated" as const,
      legalName: "Pupitre Inc.",
    }

    expect(isIncorporated(incorporated)).toBe(true)
    expect(copyrightHolder(incorporated)).toBe("Pupitre Inc.")
  })

  it("keeps the individual as long as the company has no legal name", () => {
    const named = {
      ...LEGAL_ENTITY,
      status: "individual" as const,
      legalName: "Pupitre Inc.",
    }

    expect(copyrightHolder(named)).toBe("Jordan Monier")
  })
})

describe("the legal documents", () => {
  it("cover each slug, once each, in order", () => {
    const slugs = LEGAL_DOCUMENTS.map((document) => document.slug)

    expect(slugs).toEqual([...LEGAL_DOCUMENT_SLUGS])
    expect(LEGAL_DOCUMENTS.map((document) => document.order)).toEqual(
      LEGAL_DOCUMENT_SLUGS.map((_, index) => index + 1)
    )
  })

  it("each carry a valid date", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(LegalDocumentSchema.parse(document)).toEqual(document)
    }
  })
})

describe("the sub-processors", () => {
  it("name their role and region in both languages", () => {
    expect(SUB_PROCESSORS.length).toBeGreaterThan(0)
    for (const processor of SUB_PROCESSORS) {
      expect(SubProcessorSchema.parse(processor)).toEqual(processor)
    }
  })

  it("name only those that touch personal data", () => {
    const names = SUB_PROCESSORS.map((processor) => processor.name)

    expect(names).toContain("Cloudflare, Inc.")
    expect(names).toContain("PostHog, Inc.")
    expect(names).not.toContain("GitHub")
  })
})

describe("outgoing attachments", () => {
  it("fit in five mebibytes, ten files and ten minutes of signed URL", () => {
    expect(MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024)
    expect(MAIL_MAX_OUTBOUND_ATTACHMENTS).toBe(10)
    expect(MAIL_SIGNED_URL_TTL_SECONDS).toBe(600)
  })

  it("refuse an executable or a script, whatever the case", () => {
    expect(isBlockedAttachment("rapport.exe")).toBe(true)
    expect(isBlockedAttachment("Installer.MSI")).toBe(true)
    expect(isBlockedAttachment("script.ps1")).toBe(true)
    expect(isBlockedAttachment("archive.tar.sh")).toBe(true)
    expect(isBlockedAttachment("rapport.pdf")).toBe(false)
    expect(isBlockedAttachment("sans-extension")).toBe(false)
    expect(MAIL_BLOCKED_ATTACHMENT_EXTENSIONS).toContain("js")
  })

  it("display inline only for a raster image or a PDF", () => {
    expect(isPreviewableMailType("image/png")).toBe(true)
    expect(isPreviewableMailType("IMAGE/JPEG; charset=binary")).toBe(true)
    expect(isPreviewableMailType("application/pdf")).toBe(true)
    expect(isPreviewableMailType("image/svg+xml")).toBe(false)
    expect(isPreviewableMailType("text/html")).toBe(false)
    expect(isPreviewableMailType(null)).toBe(false)
  })
})
