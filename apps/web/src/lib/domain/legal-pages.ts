import type { Locale } from "@pupitre/shared/i18n"
import { SITE_URL } from "@/lib/config/urls"
import type { DictionaryKey } from "@/lib/i18n/en"

export interface LegalPage {
  slug: string
  key: DictionaryKey
}

export const LEGAL_PAGES: readonly LegalPage[] = [
  { slug: "terms", key: "footer.legal.terms" },
  { slug: "privacy", key: "footer.legal.privacy" },
  { slug: "licence", key: "footer.legal.licence" },
  { slug: "acceptable-use", key: "footer.legal.acceptableUse" },
  { slug: "data-processing", key: "footer.legal.dpa" },
]

export function legalUrl(slug: string, locale: Locale): string {
  return `${SITE_URL}/${locale === "fr" ? "fr/" : ""}legal/${slug}/`
}
