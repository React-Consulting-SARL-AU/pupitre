import {
  isIncorporated,
  LEGAL_ENTITY,
  type LegalEntity,
} from "@pupitre/shared/legal"
import {
  BILLING_INTERVALS,
  type BillingInterval,
  getPlan,
  PLANS,
  yearlyPriceUsd,
} from "@pupitre/shared/plans"
import { type Locale, localizePath, planName } from "./i18n"
import { canonicalUrl } from "./seo"
import { CONSOLE_URL } from "./urls"

const SCHEMA_CONTEXT = "https://schema.org"

export interface LaunchOffer {
  endsAt: Date
  name: string
}

export interface SoftwareApplicationInput {
  locale: Locale
  name: string
  description: string
  launch?: LaunchOffer
}

export interface ProductInput {
  locale: Locale
  name: string
  description: string
  intervals: Record<BillingInterval, string>
  launch?: LaunchOffer
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

function lastDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function softwareApplication({
  locale,
  name,
  description,
  launch,
}: SoftwareApplicationInput) {
  const pricing = canonicalUrl(localizePath("/pricing/", locale))

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "SoftwareApplication",
    name,
    description,
    url: canonicalUrl(localizePath("/", locale)),
    inLanguage: locale,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    offers: launch
      ? {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          priceValidUntil: lastDay(launch.endsAt),
          url: pricing,
        }
      : {
          "@type": "Offer",
          price: String(getPlan("solo").monthlyPriceUsd),
          priceCurrency: "USD",
          url: pricing,
        },
  }
}

function launchOffers(launch: LaunchOffer) {
  return [
    {
      "@type": "Offer",
      name: launch.name,
      price: "0",
      priceCurrency: "USD",
      priceValidUntil: lastDay(launch.endsAt),
      url: CONSOLE_URL,
      availability: "https://schema.org/InStock",
    },
  ]
}

function paidOffers(
  locale: Locale,
  intervals: Record<BillingInterval, string>
) {
  return PLANS.filter((plan) => plan.availability === "available").flatMap(
    (plan) =>
      BILLING_INTERVALS.map((interval) => ({
        "@type": "Offer",
        name: `${planName(plan, locale)}, ${intervals[interval]}`,
        price: String(
          interval === "month" ? plan.monthlyPriceUsd : yearlyPriceUsd(plan)
        ),
        priceCurrency: "USD",
        url: CONSOLE_URL,
        availability: "https://schema.org/InStock",
      }))
  )
}

export function product({
  locale,
  name,
  description,
  intervals,
  launch,
}: ProductInput) {
  const offers = launch ? launchOffers(launch) : paidOffers(locale, intervals)

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Product",
    name,
    description,
    url: canonicalUrl(localizePath("/pricing/", locale)),
    brand: { "@type": "Brand", name },
    offers,
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
