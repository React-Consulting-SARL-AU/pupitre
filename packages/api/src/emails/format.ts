import type { Locale } from "@pupitre/shared/i18n"

const TAGS: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" }

export function formatDate(locale: Locale, value: Date): string {
  return new Intl.DateTimeFormat(TAGS[locale], {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(value)
}

export function formatDateTime(locale: Locale, value: Date): string {
  return new Intl.DateTimeFormat(TAGS[locale], {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)
}
