import type { ModuleId } from "@pupitre/shared/catalog"
import {
  DOCS_SECTION_META,
  DOCS_SECTIONS,
  type DocsSectionId,
} from "../content/site/docs"
import { type Locale, localizePath } from "./i18n"

export interface DocsEntry {
  slug: string
  section: DocsSectionId
  sectionOrder: number
  order: number
  title: string
  description: string
}

export interface DocsSection {
  id: DocsSectionId
  title: string
  lead: string
  entries: DocsEntry[]
}

export const SERVICES_SLUG = "services"

export function docSlug(id: string): string {
  const [, ...rest] = id.split("/")

  return rest.join("/")
}

export function docPath(slug: string, locale: Locale): string {
  return localizePath(slug === "" ? "/docs/" : `/docs/${slug}/`, locale)
}

export function moduleSlug(id: ModuleId): string {
  return `${SERVICES_SLUG}/${id.replace(".", "-")}`
}

export function moduleIdFromSlug(slug: string, ids: readonly string[]): string {
  const bare = slug.replace(`${SERVICES_SLUG}/`, "")

  return ids.find((id) => id.replace(".", "-") === bare) ?? bare
}

function isSection(value: string): value is DocsSectionId {
  return (DOCS_SECTIONS as readonly string[]).includes(value)
}

export function sectionOf(value: string): DocsSectionId {
  return isSection(value) ? value : "start"
}

function compare(a: DocsEntry, b: DocsEntry): number {
  return a.order - b.order || a.title.localeCompare(b.title)
}

export function groupSections(
  entries: DocsEntry[],
  locale: Locale
): DocsSection[] {
  return DOCS_SECTIONS.map((id) => ({
    id,
    title: DOCS_SECTION_META[id].title[locale],
    lead: DOCS_SECTION_META[id].lead[locale],
    entries: entries.filter((entry) => entry.section === id).sort(compare),
  })).filter((section) => section.entries.length > 0)
}

export function flatten(sections: DocsSection[]): DocsEntry[] {
  return sections.flatMap((section) => section.entries)
}

export interface Neighbours {
  previous?: DocsEntry
  next?: DocsEntry
}

export function neighbours(ordered: DocsEntry[], slug: string): Neighbours {
  const index = ordered.findIndex((entry) => entry.slug === slug)

  if (index === -1) {
    return {}
  }

  return { previous: ordered[index - 1], next: ordered[index + 1] }
}

export interface Heading {
  depth: number
  slug: string
  text: string
}

export function tableOfContents(headings: Heading[]): Heading[] {
  return headings.filter(
    (heading) => heading.depth === 2 || heading.depth === 3
  )
}
