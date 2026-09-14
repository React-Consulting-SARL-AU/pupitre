import type { Locale } from "../../lib/i18n"
import { integrationsEn } from "./integrations.en"
import { integrationsFr } from "./integrations.fr"

export interface IntegrationsContent {
  meta: { title: string; description: string }
  hero: { label: string; headline: string; lead: string; cta: string }
  entry: { documentation: string }
  closing: { title: string; body: string; link: string }
}

const INTEGRATIONS: Record<Locale, IntegrationsContent> = {
  en: integrationsEn,
  fr: integrationsFr,
}

export function integrationsContent(locale: Locale): IntegrationsContent {
  return INTEGRATIONS[locale]
}
