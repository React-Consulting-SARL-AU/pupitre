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
  { slug: "terms", order: 1, updated: "2026-09-06", status: "draft" },
  { slug: "licence", order: 2, updated: "2026-09-06", status: "draft" },
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
      fr: "Hébergement du site et de la console, stockage des binaires, envoi des emails transactionnels",
      en: "Hosting of the site and the console, binary storage, transactional email delivery",
    },
    region: { fr: "Réseau mondial", en: "Global network" },
  },
  {
    name: "Neon",
    purpose: {
      fr: "Base de données de la plateforme : comptes, organisations, serveurs, abonnements",
      en: "Platform database: accounts, organisations, servers, subscriptions",
    },
    region: {
      fr: "États-Unis à l’ouverture ; eu-central-1 aujourd’hui",
      en: "United States at launch; eu-central-1 today",
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
}

const NOTICES: Record<Locale, DevelopmentNotice> = {
  fr: {
    label: "Brouillon",
    title: "Projet en développement — ce document n’engage personne",
    body: "Pupitre est en cours de développement. Le service n’est pas ouvert au public, aucun abonnement n’est vendu et aucun compte client n’est servi. Ce texte est un brouillon de travail, publié pour être lu et corrigé : il n’a aucune valeur contractuelle.",
    entity:
      "L’éditeur n’est pas encore immatriculé. L’identité légale, l’adresse du siège, les numéros d’immatriculation et les mentions fiscales seront ajoutés à la constitution de la société, et chaque document sera relu par un avocat avant d’engager qui que ce soit.",
    short:
      "Projet en développement : documents en brouillon, sans valeur contractuelle.",
  },
  en: {
    label: "Draft",
    title: "Project under development — this document binds no one",
    body: "Pupitre is under development. The service is not open to the public, no subscription is sold and no customer account is served. This text is a working draft, published so it can be read and corrected: it has no contractual value.",
    entity:
      "The publisher is not incorporated yet. The legal identity, registered address, registration numbers and tax details will be added when the company is formed, and every document will be reviewed by a lawyer before it binds anyone.",
    short:
      "Project under development: draft documents, with no contractual value.",
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

export function legalEntityLabel(
  locale: Locale,
  entity: LegalEntity = LEGAL_ENTITY
): string {
  if (entity.legalName) {
    return entity.legalName
  }

  return locale === "fr"
    ? `${entity.tradingName} — société en cours de constitution`
    : `${entity.tradingName} — company being formed`
}
