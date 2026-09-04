import type { Locale } from "../../lib/i18n"
import { homeEn } from "./home.en"
import { homeFr } from "./home.fr"

export interface FeatureItem {
  title: string
  lines: string[]
}

export interface ClaimItem {
  statement: string
  proof: string
}

export interface FaqItem {
  question: string
  answer: string
}

export interface HomeContent {
  meta: { title: string; description: string }
  hero: {
    headline: string
    lead: string
    download: string
    order: string
    note: string
  }
  features: { label: string; title: string; items: FeatureItem[] }
  catalog: { label: string; title: string; lead: string }
  promise: { label: string; title: string; items: ClaimItem[] }
  faq: { label: string; title: string; items: FaqItem[] }
  pricing: {
    label: string
    title: string
    perServer: string
    annual: string
    trial: string
    hosted: string
    link: string
  }
}

const HOME: Record<Locale, HomeContent> = { en: homeEn, fr: homeFr }

export function homeContent(locale: Locale): HomeContent {
  return HOME[locale]
}
