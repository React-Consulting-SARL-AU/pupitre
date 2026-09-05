import { getCollection } from "astro:content"
import { CATALOG_ENTRIES } from "../content/site/catalog"
import { MODULE_LABELS } from "../content/site/docs"
import { docSlug, moduleSlug } from "../lib/docs"
import { LOCALES, localizePath, translator } from "../lib/i18n"
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
    block("Start here", [
      ...start.map((entry) => ({
        title: entry.data.title,
        href: link(localizePath(`/docs/${docSlug(entry.id)}/`, "en")),
        note: entry.data.description,
      })),
    ]),
    block("Documentation", [
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
    block("Service catalogue", [
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
    block("Product", [
      {
        title: "Pricing",
        href: link(localizePath("/pricing/", "en")),
        note: "One price per server, monthly or yearly, and what happens when it stops.",
      },
      {
        title: "Download",
        href: link(localizePath("/download/", "en")),
        note: "The desktop app for macOS, Windows and Linux, with the requirements on both sides.",
      },
      {
        title: "Changelog",
        href: link(localizePath("/changelog/", "en")),
        note: "One entry per release of the app and of the agent.",
      },
    ]),
    block(
      "Writing",
      posts.map((entry) => ({
        title: entry.data.title,
        href: link(localizePath(`/blog/${docSlug(entry.id)}/`, "en")),
        note: entry.data.description,
      }))
    ),
    block(
      "Legal",
      legal.map((entry) => ({
        title: entry.data.title,
        href: link(localizePath(`/legal/${docSlug(entry.id)}/`, "en")),
        note: entry.data.description,
      }))
    ),
    block("Other languages", [
      {
        title: "Français",
        href: link(localizePath("/", "fr")),
        note: `The whole site exists in ${LOCALES.join(" and ")} under the same paths.`,
      },
    ]),
  ]

  const body = [
    "# Pupitre",
    "",
    "> A desktop app that turns any Ubuntu VPS into a workshop for AI agents, and a compiled agent installed on that server. The customer brings the machine; Pupitre inspects it, installs the services they choose, hardens it, and becomes the window onto it.",
    "",
    "Pupitre is a closed commercial product. Nothing connects inward to a customer's server, no private key leaves their laptop, and when a subscription stops the server keeps running as an ordinary Ubuntu machine.",
    "",
    ...sections,
  ].join("\n")

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
