import { getPlan } from "@pupitre/shared/plans"
import { type Locale, localizePath } from "./i18n"
import { canonicalUrl } from "./seo"

const SCHEMA_CONTEXT = "https://schema.org"

export interface SoftwareApplicationInput {
  locale: Locale
  name: string
  description: string
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
