import { getCollection } from "astro:content"
import { CATALOG_ENTRIES } from "../content/site/catalog"
import { MODULE_LABELS } from "../content/site/docs"
import { LLMS } from "../content/site/llms"
import { docSlug, moduleSlug } from "../lib/docs"
import { fill, LOCALES, localizePath, translator } from "../lib/i18n"
import { canonicalUrl } from "../lib/seo"

interface Line {
  title: string
  href: string
  note: string
}

function block(heading: string, lines: Line[]): string {
  const body = lines
    .map((line) => `- [${line.title}](${line.href}): ${line.note}`)
    .join("\n")

  return `## ${heading}\n\n${body}\n`
}

export async function GET() {
  const t = translator("en")
  const docs = await getCollection("docs")
  const posts = await getCollection(
    "blog",
    (entry) => entry.data.locale === "en"
  )
  const legal = await getCollection(
    "legal",
    (entry) => entry.data.locale === "en"
  )

  const start = docs
    .filter(
      (entry) => entry.data.locale === "en" && entry.data.section === "start"
    )
    .sort((a, b) => a.data.order - b.data.order)
  const rest = docs
    .filter(
      (entry) => entry.data.locale === "en" && entry.data.section !== "start"
    )
    .sort(
      (a, b) =>
        a.data.section.localeCompare(b.data.section) ||
        a.data.order - b.data.order
    )

  const link = (path: string) => canonicalUrl(path)

  const sections = [
    block(LLMS.sections.start, [
      ...start.map((entry) => ({
        title: entry.data.title,
        href: link(localizePath(`/docs/${docSlug(entry.id)}/`, "en")),
        note: entry.data.description,
      })),
    ]),
    block(LLMS.sections.documentation, [
      {
        title: t("docs.label"),
        href: link(localizePath("/docs/", "en")),
        note: t("docs.description"),
      },
      ...rest.map((entry) => ({
        title: entry.data.title,
        href: link(localizePath(`/docs/${docSlug(entry.id)}/`, "en")),
        note: entry.data.description,
      })),
    ]),
    block(LLMS.sections.catalog, [
      {
        title: MODULE_LABELS.overviewTitle.en,
        href: link(localizePath("/docs/services/", "en")),
        note: MODULE_LABELS.overviewLead.en,
      },
      ...CATALOG_ENTRIES.map((entry) => ({
        title: `${entry.name.en} (${entry.id})`,
        href: link(localizePath(`/docs/${moduleSlug(entry.id)}/`, "en")),
        note: entry.detail.en,
      })),
    ]),
    block(
      LLMS.sections.product,
      LLMS.product.map((entry) => ({
        title: entry.title,
        href: link(localizePath(entry.path, "en")),
        note: entry.note,
      }))
    ),
    block(
      LLMS.sections.writing,
      posts.map((entry) => ({
        title: entry.data.title,
        href: link(localizePath(`/blog/${docSlug(entry.id)}/`, "en")),
        note: entry.data.description,
      }))
    ),
    block(
      LLMS.sections.legal,
      legal.map((entry) => ({
        title: entry.data.title,
        href: link(localizePath(`/legal/${docSlug(entry.id)}/`, "en")),
        note: entry.data.description,
      }))
    ),
    block(LLMS.sections.languages, [
      {
        title: LLMS.alternate.title,
        href: link(localizePath("/", "fr")),
        note: fill(LLMS.alternate.note, {
          locales: LOCALES.join(" and "),
        }),
      },
    ]),
  ]

  const body = [
    `# ${LLMS.title}`,
    "",
    `> ${LLMS.summary}`,
    "",
    LLMS.note,
    "",
    ...sections,
  ].join("\n")

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
