import { z } from "zod"
import type { Locale } from "../i18n/locale"

export const PROJECT_STAGES = ["development", "public"] as const

export const ProjectStageSchema = z.enum(PROJECT_STAGES)

export type ProjectStage = z.infer<typeof ProjectStageSchema>

/**
 * The repo's only switch: as long as it's `development`, no legal text binds
 * anyone and nothing is sold. It moves to `public` the day the publisher is
 * incorporated and the documents have been reviewed.
 */
export const PROJECT_STAGE: ProjectStage = "development"

export const ENTITY_STATUSES = ["in-formation", "incorporated"] as const

export const EntityStatusSchema = z.enum(ENTITY_STATUSES)

export type EntityStatus = z.infer<typeof EntityStatusSchema>

export const LegalEntitySchema = z.object({
  status: EntityStatusSchema,
  tradingName: z.string().min(1),
  owner: z.string().min(1),
  legalName: z.string().min(1).nullable(),
  form: z.string().min(1).nullable(),
  jurisdiction: z.string().min(1).nullable(),
  registrationNumber: z.string().min(1).nullable(),
  taxId: z.string().min(1).nullable(),
  vatNumber: z.string().min(1).nullable(),
  registeredAddress: z.string().min(1).nullable(),
  governingLaw: z.string().min(1).nullable(),
  courts: z.string().min(1).nullable(),
  publicationDirector: z.string().min(1).nullable(),
})

export type LegalEntity = z.infer<typeof LegalEntitySchema>

export const LEGAL_ENTITY: LegalEntity = {
  status: "in-formation",
  tradingName: "Pupitre",
  owner: "Jordan Monier",
  legalName: null,
  form: null,
  jurisdiction: null,
  registrationNumber: null,
  taxId: null,
  vatNumber: null,
  registeredAddress: null,
  governingLaw: null,
  courts: null,
  publicationDirector: null,
}

export const LEGAL_CONTACTS = {
  support: "support@pupitre.studio",
  legal: "legal@pupitre.studio",
  privacy: "privacy@pupitre.studio",
  security: "security@pupitre.studio",
} as const

export const PUPITRE_ORIGINS = {
  site: "https://pupitre.studio",
  app: "https://app.pupitre.studio",
} as const

/** Every address under this domain reaches the platform inbox, catch-all. */
export const MAIL_DOMAIN = new URL(PUPITRE_ORIGINS.site).hostname

/**
 * Above this, a mail is refused at the edge. Buffering it kills the isolate,
 * and Cloudflare replays a delivery that died forever.
 */
export const MAIL_MAX_BYTES = 20 * 1024 * 1024

/** D1 refuses a row past a megabyte; the raw `.eml` in the bucket keeps the whole body. */
export const MAIL_MAX_TEXT_CHARS = 200_000

export const MAIL_LOCAL_PART_MAX_LENGTH = 64

export const MAIL_DISPLAY_NAME_MAX_LENGTH = 80

export const MAIL_SIGNATURE_MAX_LENGTH = 2000

const MAIL_LOCAL_PART_RE = /^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?$/

/**
 * A mailbox is a local part on our own domain: the catch-all brings everything
 * here, so a box declared elsewhere would be a box nobody ever reads.
 */
export function mailboxAddressOf(input: string): string | null {
  const value = input.trim().toLowerCase()
  const at = value.indexOf("@")

  if (at !== -1 && value.slice(at + 1) !== MAIL_DOMAIN) {
    return null
  }

  const local = at === -1 ? value : value.slice(0, at)

  if (local.length === 0 || local.length > MAIL_LOCAL_PART_MAX_LENGTH) {
    return null
  }

  return MAIL_LOCAL_PART_RE.test(local) ? `${local}@${MAIL_DOMAIN}` : null
}

/** What a reply or a new mail may carry, all attachments together. */
export const MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES = 5 * 1024 * 1024

export const MAIL_MAX_OUTBOUND_ATTACHMENTS = 10

/** How long a signed bucket address, to read an attachment or to upload one, stays valid. */
export const MAIL_SIGNED_URL_TTL_SECONDS = 600

/**
 * One journal line per reader and per sensitive thread inside this window: a
 * console that refetches the open thread is still the same reading.
 */
export const MAIL_READ_AUDIT_WINDOW_MS = 10 * 60 * 1000

export const MAIL_BLOCKED_ATTACHMENT_EXTENSIONS = [
  "exe",
  "bat",
  "cmd",
  "com",
  "scr",
  "pif",
  "vbs",
  "js",
  "jse",
  "wsf",
  "wsh",
  "msi",
  "jar",
  "ps1",
  "sh",
  "dll",
] as const

const BLOCKED_EXTENSIONS = new Set<string>(MAIL_BLOCKED_ATTACHMENT_EXTENSIONS)

const PDF_TYPE = "application/pdf"

const IMAGE_TYPE_PREFIX = "image/"

/** An SVG is an image that can carry a script: it is saved, never shown. */
const SVG_TYPE = "image/svg+xml"

export function isBlockedAttachment(filename: string): boolean {
  const extension = filename.split(".").pop()?.toLowerCase() ?? ""

  return BLOCKED_EXTENSIONS.has(extension)
}

/** Only a raster image or a PDF opens in the console; anything else is handed over to save. */
export function isPreviewableMailType(
  mimeType: string | null | undefined
): boolean {
  const declared = mimeType?.split(";")[0].trim().toLowerCase() ?? ""

  return (
    declared === PDF_TYPE ||
    (declared.startsWith(IMAGE_TYPE_PREFIX) && declared !== SVG_TYPE)
  )
}

export const LEGAL_DOCUMENT_SLUGS = [
  "terms",
  "licence",
  "acceptable-use",
  "privacy",
  "data-processing",
] as const

export const LegalDocumentSlugSchema = z.enum(LEGAL_DOCUMENT_SLUGS)

export type LegalDocumentSlug = z.infer<typeof LegalDocumentSlugSchema>

export const LegalDocumentSchema = z.object({
  slug: LegalDocumentSlugSchema,
  order: z.int().positive(),
  updated: z.iso.date(),
  status: z.enum(["draft", "published"]),
})

export type LegalDocument = z.infer<typeof LegalDocumentSchema>

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  { slug: "terms", order: 1, updated: "2026-09-10", status: "draft" },
  { slug: "licence", order: 2, updated: "2026-09-10", status: "draft" },
  { slug: "acceptable-use", order: 3, updated: "2026-09-06", status: "draft" },
  { slug: "privacy", order: 4, updated: "2026-09-06", status: "draft" },
  { slug: "data-processing", order: 5, updated: "2026-09-06", status: "draft" },
]

export const SubProcessorSchema = z.object({
  name: z.string().min(1),
  purpose: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
  region: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
})

export type SubProcessor = z.infer<typeof SubProcessorSchema>

export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    name: "Cloudflare",
    purpose: {
      fr: "Hébergement du site et de la console, base de données de la plateforme (comptes, organisations, serveurs, abonnements), stockage des binaires, envoi des emails transactionnels",
      en: "Hosting of the site and the console, platform database (accounts, organisations, servers, subscriptions), binary storage, transactional email delivery",
    },
    region: {
      fr: "Réseau mondial ; la base de données en Europe de l’Ouest",
      en: "Global network; the database in Western Europe",
    },
  },
  {
    name: "Stripe",
    purpose: {
      fr: "Encaissement en marchand officiel : paiement, facturation, taxes",
      en: "Merchant of record: payment, invoicing, taxes",
    },
    region: { fr: "États-Unis et Irlande", en: "United States and Ireland" },
  },
  {
    name: "PostHog",
    purpose: {
      fr: "Mesure d’audience du site, seulement après consentement",
      en: "Site analytics, only after consent",
    },
    region: {
      fr: "États-Unis à l’ouverture ; Union européenne aujourd’hui",
      en: "United States at launch; European Union today",
    },
  },
  {
    name: "GitHub",
    purpose: {
      fr: "Distribution des versions signées de l’app desktop",
      en: "Distribution of the signed desktop app releases",
    },
    region: { fr: "États-Unis", en: "United States" },
  },
]

export interface DevelopmentNotice {
  label: string
  title: string
  body: string
  entity: string
  short: string
  /** One line over every page, site and console, until the project is public. */
  banner: string
}

const NOTICES: Record<Locale, DevelopmentNotice> = {
  fr: {
    label: "Brouillon",
    title: "Projet en développement — ce document n’engage personne",
    body: "Pupitre est en cours de développement. Le service n’est pas ouvert au public, aucun abonnement n’est vendu et aucun compte client n’est servi. Ce texte est un brouillon de travail, publié pour être lu et corrigé : il n’a aucune valeur contractuelle.",
    entity:
      "L’éditeur n’est pas encore immatriculé. Jusqu’à la constitution de la société, Pupitre — le code, la marque, les noms de domaine et la plateforme — appartient personnellement à Jordan Monier, seul titulaire des droits. L’identité légale, l’adresse du siège, les numéros d’immatriculation et les mentions fiscales seront ajoutés à la constitution de la société, à laquelle le projet sera apporté, et chaque document sera relu par un avocat avant d’engager qui que ce soit.",
    short:
      "Projet en développement : documents en brouillon, sans valeur contractuelle.",
    banner:
      "Pupitre est en cours de développement : rien ici n’est encore ouvert au public, et tout peut changer.",
  },
  en: {
    label: "Draft",
    title: "Project under development — this document binds no one",
    body: "Pupitre is under development. The service is not open to the public, no subscription is sold and no customer account is served. This text is a working draft, published so it can be read and corrected: it has no contractual value.",
    entity:
      "The publisher is not incorporated yet. Until the company is formed, Pupitre — the code, the brand, the domain names and the platform — belongs personally to Jordan Monier, its sole rights holder. The legal identity, registered address, registration numbers and tax details will be added when the company is formed and the project is transferred to it, and every document will be reviewed by a lawyer before it binds anyone.",
    short:
      "Project under development: draft documents, with no contractual value.",
    banner:
      "Pupitre is under development: nothing here is open to the public yet, and everything may change.",
  },
}

export function developmentNotice(locale: Locale): DevelopmentNotice {
  return NOTICES[locale]
}

export function isPublicStage(stage: ProjectStage = PROJECT_STAGE): boolean {
  return stage === "public"
}

export function isIncorporated(entity: LegalEntity = LEGAL_ENTITY): boolean {
  return entity.status === "incorporated"
}

/** Who holds the rights today: the person, until the company exists to receive them. */
export function copyrightHolder(entity: LegalEntity = LEGAL_ENTITY): string {
  if (isIncorporated(entity) && entity.legalName) {
    return entity.legalName
  }

  return entity.owner
}
