import { getCollection } from "astro:content"
import { CATALOG_ENTRIES } from "../content/site/catalog"
import { MODULE_LABELS } from "../content/site/docs"
import {
  type DocsEntry,
  type DocsSection,
  docSlug,
  groupSections,
  moduleSlug,
  SERVICES_SLUG,
  sectionOf,
} from "./docs"
import type { Locale } from "./i18n"

export async function markdownEntries(locale: Locale): Promise<DocsEntry[]> {
  const docs = await getCollection(
    "docs",
    (entry) => entry.data.locale === locale
  )

  return docs.map((entry) => ({
    slug: docSlug(entry.id),
    section: sectionOf(entry.data.section),
    sectionOrder: entry.data.sectionOrder,
    order: entry.data.order,
    title: entry.data.title,
    description: entry.data.description,
  }))
}

export function serviceEntries(locale: Locale): DocsEntry[] {
  const overview: DocsEntry = {
    slug: SERVICES_SLUG,
    section: "services",
    sectionOrder: 0,
    order: 0,
    title: MODULE_LABELS.overviewTitle[locale],
    description: MODULE_LABELS.overviewLead[locale],
  }

  const modules = CATALOG_ENTRIES.map((entry, position) => ({
    slug: moduleSlug(entry.id),
    section: "services" as const,
    sectionOrder: 0,
    order: position + 1,
    title: entry.name[locale],
    description: entry.detail[locale],
  }))

  return [overview, ...modules]
}

export async function docsSections(locale: Locale): Promise<DocsSection[]> {
  const entries = [
    ...(await markdownEntries(locale)),
    ...serviceEntries(locale),
  ]

  return groupSections(entries, locale)
}
