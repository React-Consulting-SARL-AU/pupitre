import { z } from "zod"

export const ENTITY_STATUSES = ["individual", "incorporated"] as const

export const EntityStatusSchema = z.enum(ENTITY_STATUSES)

export type EntityStatus = z.infer<typeof EntityStatusSchema>

export const LegalEntitySchema = z.object({
  status: EntityStatusSchema,
  tradingName: z.string().min(1),
  owner: z.string().min(1),
  /** The country whose law governs the terms, and whose courts hear a dispute. */
  jurisdiction: z.string().min(1),
  publicationDirector: z.string().min(1),
  legalName: z.string().min(1).nullable(),
  form: z.string().min(1).nullable(),
  registrationNumber: z.string().min(1).nullable(),
  taxId: z.string().min(1).nullable(),
  vatNumber: z.string().min(1).nullable(),
  registeredAddress: z.string().min(1).nullable(),
})

export type LegalEntity = z.infer<typeof LegalEntitySchema>

/**
 * The publisher is a person until a company exists to take the project over:
 * the terms say so, and say that the responsible party may change.
 */
export const LEGAL_ENTITY: LegalEntity = {
  status: "individual",
  tradingName: "Pupitre",
  owner: "Jordan Monier",
  jurisdiction: "Morocco",
  publicationDirector: "Jordan Monier",
  legalName: null,
  form: null,
  registrationNumber: null,
  taxId: null,
  vatNumber: null,
  registeredAddress: null,
}

/**
 * The company whose certificates sign the desktop app builds, so macOS and
 * Windows accept them. It signs, and does nothing else: it is not the publisher.
 */
export const CODE_SIGNING_ENTITY = {
  name: "React Consulting SARL AU",
  jurisdiction: "Morocco",
} as const

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
})

export type LegalDocument = z.infer<typeof LegalDocumentSchema>

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  { slug: "terms", order: 1, updated: "2026-09-20" },
  { slug: "licence", order: 2, updated: "2026-09-20" },
  { slug: "acceptable-use", order: 3, updated: "2026-09-20" },
  { slug: "privacy", order: 4, updated: "2026-09-20" },
  { slug: "data-processing", order: 5, updated: "2026-09-20" },
]

export const SubProcessorSchema = z.object({
  name: z.string().min(1),
  purpose: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
  region: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
})

export type SubProcessor = z.infer<typeof SubProcessorSchema>

/** Who processes personal data for the platform. Stripe is listed now so nobody discovers it the day billing opens. */
export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    name: "Cloudflare, Inc.",
    purpose: {
      fr: "Hébergement du site et de la console, base de données de la plateforme (comptes, organisations, serveurs, abonnements, journal), stockage des binaires et des pièces jointes, réception et envoi des emails",
      en: "Hosting of the site and the console, platform database (accounts, organisations, servers, subscriptions, journal), storage of binaries and attachments, inbound and outbound email",
    },
    region: {
      fr: "Société américaine, réseau mondial ; la base de données et les fichiers en Europe de l’Ouest",
      en: "United States company, global network; the database and the files in Western Europe",
    },
  },
  {
    name: "PostHog, Inc.",
    purpose: {
      fr: "Mesure d’audience et d’usage du site et de la console, sans cookie ni identifiant durable",
      en: "Audience and usage measurement of the site and the console, without a cookie or a durable identifier",
    },
    region: {
      fr: "Société américaine ; les événements sont stockés dans l’Union européenne",
      en: "United States company; events are stored in the European Union",
    },
  },
  {
    name: "Stripe, Inc.",
    purpose: {
      fr: "Encaissement en marchand officiel — paiement, facturation, taxes — à partir du jour où la facturation ouvre ; aucune donnée ne lui est transmise pendant le lancement gratuit",
      en: "Merchant of record — payment, invoicing, taxes — from the day billing opens; nothing is sent to it during the free launch",
    },
    region: { fr: "États-Unis et Irlande", en: "United States and Ireland" },
  },
]

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
