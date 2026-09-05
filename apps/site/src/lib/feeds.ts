import type { Locale } from "./i18n"

export interface FeedItem {
  title: string
  description: string
  link: string
  pubDate: Date
}

export function feedLanguage(locale: Locale): string {
  return locale === "fr" ? "fr-FR" : "en-US"
}

export function byNewest<T extends { pubDate: Date }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
}
