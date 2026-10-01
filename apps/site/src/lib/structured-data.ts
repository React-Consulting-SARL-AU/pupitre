import {
  isIncorporated,
  LEGAL_ENTITY,
  type LegalEntity,
} from "@pupitre/shared/legal"
import { type Locale, localizePath } from "./i18n"
import { canonicalUrl } from "./seo"
import { CONSOLE_URL } from "./urls"

const SCHEMA_CONTEXT = "https://schema.org"

export interface SoftwareApplicationInput {
  locale: Locale
  name: string
  description: string
}

export interface ProductInput {
  locale: Locale
  name: string
  description: string
  offer: string
}

export interface FaqEntry {
  question: string
  answer: string
}

export interface OrganizationInput {
  name: string
  locale: Locale
  entity?: LegalEntity
}

export interface ArticleInput {
  locale: Locale
  type: "BlogPosting" | "TechArticle"
  headline: string
  description: string
  pathname: string
  published?: Date
  modified?: Date
  author?: string
  publisher: string
}

export interface BreadcrumbEntry {
  name: string
  pathname: string
}

export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c")
}

const FREE_PRICE = "0"

const PRICE_CURRENCY = "USD"

export function softwareApplication({
  locale,
  name,
  description,
}: SoftwareApplicationInput) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "SoftwareApplication",
    name,
    description,
    url: canonicalUrl(localizePath("/", locale)),
    inLanguage: locale,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    offers: {
      "@type": "Offer",
      price: FREE_PRICE,
      priceCurrency: PRICE_CURRENCY,
      url: canonicalUrl(localizePath("/pricing/", locale)),
    },
  }
}

export function product({ locale, name, description, offer }: ProductInput) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Product",
    name,
    description,
    url: canonicalUrl(localizePath("/pricing/", locale)),
    brand: { "@type": "Brand", name },
    offers: [
      {
        "@type": "Offer",
        name: offer,
        price: FREE_PRICE,
        priceCurrency: PRICE_CURRENCY,
        url: CONSOLE_URL,
        availability: "https://schema.org/InStock",
      },
    ],
  }
}

export function faqPage(entries: FaqEntry[]) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  }
}

function recordedLegalName(entity: LegalEntity): string | null {
  return isIncorporated(entity) ? entity.legalName : null
}

export function organization({
  name,
  locale,
  entity = LEGAL_ENTITY,
}: OrganizationInput) {
  const legalName = recordedLegalName(entity)

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Organization",
    name,
    ...(legalName ? { legalName } : {}),
    url: canonicalUrl(localizePath("/", locale)),
    logo: canonicalUrl("/favicon.svg"),
  }
}

export function article({
  locale,
  type,
  headline,
  description,
  pathname,
  published,
  modified,
  author,
  publisher,
}: ArticleInput) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": type,
    headline,
    description,
    inLanguage: locale,
    url: canonicalUrl(pathname),
    mainEntityOfPage: canonicalUrl(pathname),
    datePublished: published?.toISOString(),
    dateModified: (modified ?? published)?.toISOString(),
    author: author ? { "@type": "Person", name: author } : undefined,
    publisher: { "@type": "Organization", name: publisher },
  }
}

export function breadcrumbs(entries: BreadcrumbEntry[]) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: entries.map((entry, position) => ({
      "@type": "ListItem",
      position: position + 1,
      name: entry.name,
      item: canonicalUrl(entry.pathname),
    })),
  }
}
