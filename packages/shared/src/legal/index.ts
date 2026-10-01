import { z } from "zod"

const ENTITY_STATUSES = ["individual", "incorporated"] as const

const EntityStatusSchema = z.enum(ENTITY_STATUSES)

export const LegalEntitySchema = z.object({
  status: EntityStatusSchema,
  tradingName: z.string().min(1),
  owner: z.string().min(1),
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

// The licensor of the source and the publisher of the platform, which it hosts at its own expense.
export const LEGAL_ENTITY: LegalEntity = {
  status: "incorporated",
  tradingName: "Pupitre",
  owner: "Jordan Monier",
  jurisdiction: "Morocco",
  publicationDirector: "Jordan Monier",
  legalName: "React Consulting SARL AU",
  form: "SARL AU",
  registrationNumber: null,
  taxId: null,
  vatNumber: null,
  registeredAddress: null,
}

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
  downloads: "https://dl.pupitre.studio",
  // The named tunnel `bun dev` publishes the local console under, for a remote agent to reach.
  devTunnel: "https://dev.pupitre.studio",
  devConsole: "http://localhost:3000",
} as const

// Catch-all: every address under this domain reaches the platform inbox.
export const MAIL_DOMAIN = new URL(PUPITRE_ORIGINS.site).hostname

// Refused at the edge: buffering more kills the isolate, and Cloudflare replays a dead delivery forever.
export const MAIL_MAX_BYTES = 20 * 1024 * 1024

// D1 refuses a row past a megabyte; the raw `.eml` in the bucket keeps the whole body.
export const MAIL_MAX_TEXT_CHARS = 200_000

// Past this, parts stay in the raw `.eml` only: each one is a bucket write the Worker pays for.
export const MAIL_MAX_INBOUND_ATTACHMENTS = 20

export const MAIL_MAX_REFERENCES = 20

// The Email Routing MX that received the mail: no other `Authentication-Results` is trusted.
export const MAIL_TRUSTED_AUTHSERV_ID = "mx.cloudflare.net"

const MAIL_LOCAL_PART_MAX_LENGTH = 64

export const MAIL_DISPLAY_NAME_MAX_LENGTH = 80

export const MAIL_SIGNATURE_MAX_LENGTH = 2000

const MAIL_LOCAL_PART_RE = /^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?$/

// Only our own domain: a box declared elsewhere would be a box nobody ever reads.
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

// All attachments together.
export const MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES = 5 * 1024 * 1024

export const MAIL_MAX_OUTBOUND_ATTACHMENTS = 10

export const MAIL_SIGNED_URL_TTL_SECONDS = 600

// A console that refetches the open thread inside this window is still the same reading.
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

// An SVG can carry a script: it is saved, never shown.
const SVG_TYPE = "image/svg+xml"

export function isBlockedAttachment(filename: string): boolean {
  const extension = filename.split(".").pop()?.toLowerCase() ?? ""

  return BLOCKED_EXTENSIONS.has(extension)
}

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
  "billing",
  "cookies",
  "sub-processors",
  "security",
  "third-party",
  "legal-notice",
  "changes",
] as const

const LegalDocumentSlugSchema = z.enum(LEGAL_DOCUMENT_SLUGS)

export const LegalDocumentSchema = z.object({
  slug: LegalDocumentSlugSchema,
  order: z.int().positive(),
  updated: z.iso.date(),
})

type LegalDocument = z.infer<typeof LegalDocumentSchema>

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  { slug: "terms", order: 1, updated: "2026-10-01" },
  { slug: "licence", order: 2, updated: "2026-10-01" },
  { slug: "acceptable-use", order: 3, updated: "2026-09-24" },
  { slug: "privacy", order: 4, updated: "2026-10-01" },
  { slug: "data-processing", order: 5, updated: "2026-10-01" },
  { slug: "billing", order: 6, updated: "2026-10-01" },
  { slug: "cookies", order: 7, updated: "2026-10-01" },
  { slug: "sub-processors", order: 8, updated: "2026-10-01" },
  { slug: "security", order: 9, updated: "2026-09-24" },
  { slug: "third-party", order: 10, updated: "2026-10-01" },
  { slug: "legal-notice", order: 11, updated: "2026-10-01" },
  { slug: "changes", order: 12, updated: "2026-10-01" },
]

export const SubProcessorSchema = z.object({
  name: z.string().min(1),
  purpose: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
  region: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
})

type SubProcessor = z.infer<typeof SubProcessorSchema>

// Stripe is listed now so nobody discovers it the day licences are sold.
export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    name: "Cloudflare, Inc.",
    purpose: {
      fr: "Hébergement du site et de la console, base de données de la plateforme (comptes, organisations, serveurs, abonnements, journal), stockage des binaires et des pièces jointes, réception et envoi des emails",
      en: "Hosting of the site and the console, platform database (accounts, organisations, servers, subscriptions, journal), storage of binaries and attachments, inbound and outbound email",
    },
    region: {
      fr: "Société américaine, réseau mondial ; la base de données et les fichiers en Amérique du Nord",
      en: "United States company, global network; the database and the files in North America",
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
      fr: "Encaissement en marchand officiel des licences au-delà des serveurs gratuits, le jour où elles seront vendues ; aucune donnée ne lui est transmise aujourd’hui",
      en: "Merchant of record for licences beyond the free servers, the day they are sold; nothing is sent to it today",
    },
    region: { fr: "États-Unis et Irlande", en: "United States and Ireland" },
  },
]

export function isIncorporated(entity: LegalEntity = LEGAL_ENTITY): boolean {
  return entity.status === "incorporated"
}

export function copyrightHolder(entity: LegalEntity = LEGAL_ENTITY): string {
  if (isIncorporated(entity) && entity.legalName) {
    return entity.legalName
  }

  return entity.owner
}
