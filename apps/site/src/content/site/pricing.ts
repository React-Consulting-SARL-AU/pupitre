import type { BillingInterval, PlanId } from "@pupitre/shared/plans"
import type { Locale } from "../../lib/i18n"
import type { FeatureItem } from "./home"
import { pricingEn } from "./pricing.en"
import { pricingFr } from "./pricing.fr"

export interface PlanCopy {
  audience: string
  includes: string[]
  cta?: string
}

export interface PricingContent {
  meta: { title: string; description: string }
  hero: { label: string; headline: string; lead: string; unit: string }
  billing: Record<BillingInterval, string> & {
    legend: string
    yearNote: string
  }
  plans: {
    label: string
    title: string
    perServerMonth: string
    perServerYear: string
    perMonth: string
    from: string
    later: string
    serversUpTo: string
    serversUnlimited: string
    trial: string
    sameRate: string
    download: string
    items: Record<PlanId, PlanCopy>
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
