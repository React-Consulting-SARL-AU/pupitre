import type { Locale } from "../../lib/i18n"
import { homeEn } from "./home.en"
import { homeFr } from "./home.fr"

export type Mark = "on" | "warn" | "off"

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

export interface StepItem {
  title: string
  detail: string
}

export interface ReportLine {
  mark: Mark
  module: string
  detail: string
}

export interface HomeContent {
  meta: { title: string; description: string }
  hero: {
    eyebrow: string
    headline: string
    lead: string
    download: string
    order: string
    note: string
    specs: string[]
    report: {
      title: string
      caption: string
      lines: ReportLine[]
      footer: string
    }
  }
  steps: { label: string; title: string; lead: string; items: StepItem[] }
  features: { label: string; title: string; items: FeatureItem[] }
  clients: {
    label: string
    title: string
    lead: string
    items: FeatureItem[]
    note: string
  }
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
  cta: { title: string; lead: string; download: string; docs: string }
}

const HOME: Record<Locale, HomeContent> = { en: homeEn, fr: homeFr }

export function homeContent(locale: Locale): HomeContent {
  return HOME[locale]
}
