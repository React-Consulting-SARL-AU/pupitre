import {
  BILLING_INTERVALS,
  type BillingInterval,
  getPlan,
  PLANS,
  yearlyPriceEur,
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
      price: String(getPlan("solo").monthlyPriceEur),
      priceCurrency: "EUR",
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
        interval === "month" ? plan.monthlyPriceEur : yearlyPriceEur(plan)
      ),
      priceCurrency: "EUR",
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
