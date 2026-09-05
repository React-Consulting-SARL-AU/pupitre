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

export interface SoftwareApplicationInput {
  locale: Locale
  name: string
  description: string
}

export interface ProductInput {
  locale: Locale
  name: string
  description: string
  intervals: Record<BillingInterval, string>
}

export interface FaqEntry {
  question: string
  answer: string
}

export interface OrganizationInput {
  name: string
  locale: Locale
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
      price: String(getPlan("solo").monthlyPriceUsd),
      priceCurrency: "USD",
      url: canonicalUrl(localizePath("/pricing/", locale)),
    },
  }
}

export function product({
  locale,
  name,
  description,
  intervals,
}: ProductInput) {
  const offers = PLANS.filter(
    (plan) => plan.availability === "available"
  ).flatMap((plan) =>
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

export function organization({ name, locale }: OrganizationInput) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Organization",
    name,
    legalName: `${name} LLC`,
    url: canonicalUrl(localizePath("/", locale)),
    logo: canonicalUrl("/favicon.svg"),
    sameAs: [CONSOLE_URL],
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
