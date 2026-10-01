import type { Locale } from "../../lib/i18n"
import type { FeatureItem } from "./home"
import { pricingEn } from "./pricing.en"
import { pricingFr } from "./pricing.fr"

export interface PricingContent {
  meta: { title: string; description: string }
  offer: string
  hero: {
    label: string
    headline: string
    lead: string
    figure: string
    unit: string
  }
  free: {
    label: string
    title: string
    lead: string
    included: FeatureItem
    asked: FeatureItem
    signUp: string
    download: string
  }
  beyond: {
    label: string
    title: string
    lead: string
    note: string
    contact: string
  }
  source: {
    label: string
    title: string
    lead: string
    allowed: FeatureItem
    forbidden: FeatureItem
    licence: string
    repository: string
  }
  stop: {
    label: string
    title: string
    lead: string
    keep: FeatureItem
    lose: FeatureItem
    note: string
  }
  diy: {
    label: string
    title: string
    lead: string
    replaces: FeatureItem
    keeps: FeatureItem
  }
  catalog: {
    label: string
    title: string
    lead: string
    available: string
    link: string
  }
}

const PRICING: Record<Locale, PricingContent> = { en: pricingEn, fr: pricingFr }

export function pricingContent(locale: Locale): PricingContent {
  return PRICING[locale]
}
