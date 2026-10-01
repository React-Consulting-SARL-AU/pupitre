import { getCollection } from "astro:content"
import { FREE_SERVERS } from "@pupitre/shared/plans"
import { CATALOG_ENTRIES } from "../content/site/catalog"
import { MODULE_LABELS, servicesOverviewLead } from "../content/site/docs"
import { downloadContent } from "../content/site/download"
import { homeContent } from "../content/site/home"
import { integrationsContent } from "../content/site/integrations"
import { pricingContent } from "../content/site/pricing"
import { securityContent } from "../content/site/security"
import { docSlug, moduleSlug } from "./docs"
import { fill, LOCALES, type Locale, localizePath, translator } from "./i18n"
import type { OgCard } from "./og"
import { ogSlug } from "./seo"

export interface OgPage {
  slug: string
  card: OgCard
}

function footnote(pathname: string): string {
  return `pupitre.studio${pathname}`
}

function page(pathname: string, card: Omit<OgCard, "footnote">): OgPage {
  return {
    slug: ogSlug(pathname),
    card: { ...card, footnote: footnote(pathname) },
  }
}

async function pagesFor(locale: Locale): Promise<OgPage[]> {
  const t = translator(locale)
  const home = homeContent(locale)
  const pricing = pricingContent(locale)
  const download = downloadContent(locale)
  const integrations = integrationsContent(locale)
  const security = securityContent(locale)
  const at = (path: string) => localizePath(path, locale)

  const docs = await getCollection(
    "docs",
    (entry) => entry.data.locale === locale
  )
  const posts = await getCollection(
    "blog",
    (entry) => entry.data.locale === locale
  )
  const legal = await getCollection(
    "legal",
    (entry) => entry.data.locale === locale
  )

  return [
    page(at("/"), {
      eyebrow: home.hero.eyebrow,
      title: home.hero.headline,
      description: home.meta.description,
    }),
    page(at("/pricing/"), {
      eyebrow: pricing.hero.label,
      title: fill(pricing.hero.headline, { count: FREE_SERVERS }),
      description: fill(pricing.meta.description, { count: FREE_SERVERS }),
    }),
    page(at("/download/"), {
      eyebrow: download.hero.label,
      title: download.hero.headline,
      description: download.meta.description,
    }),
    page(at("/integrations/"), {
      eyebrow: integrations.hero.label,
      title: integrations.hero.headline,
      description: integrations.meta.description,
    }),
    page(at("/security/"), {
      eyebrow: security.hero.label,
      title: security.hero.headline,
      description: security.meta.description,
    }),
    page(at("/docs/"), {
      eyebrow: t("docs.label"),
      title: t("docs.headline"),
      description: t("docs.lead"),
    }),
    page(at("/docs/services/"), {
      eyebrow: t("docs.label"),
      title: MODULE_LABELS.overviewTitle[locale],
      description: servicesOverviewLead(locale),
    }),
    page(at("/blog/"), {
      eyebrow: t("blog.label"),
      title: t("blog.headline"),
      description: t("blog.lead"),
    }),
    page(at("/legal/"), {
      eyebrow: t("legal.label"),
      title: t("legal.headline"),
      description: t("legal.lead"),
    }),
    ...docs.map((entry) =>
      page(at(`/docs/${docSlug(entry.id)}/`), {
        eyebrow: t("docs.label"),
        title: entry.data.title,
        description: entry.data.description,
      })
    ),
    ...CATALOG_ENTRIES.map((entry) =>
      page(at(`/docs/${moduleSlug(entry.id)}/`), {
        eyebrow: entry.id,
        title: entry.name[locale],
        description: entry.detail[locale],
      })
    ),
    ...posts.map((entry) =>
      page(at(`/blog/${docSlug(entry.id)}/`), {
        eyebrow: t("blog.label"),
        title: entry.data.title,
        description: entry.data.description,
      })
    ),
    ...legal.map((entry) =>
      page(at(`/legal/${docSlug(entry.id)}/`), {
        eyebrow: t("legal.label"),
        title: entry.data.title,
        description: entry.data.description,
      })
    ),
  ]
}

export async function ogPages(): Promise<OgPage[]> {
  const perLocale = await Promise.all(LOCALES.map(pagesFor))

  return perLocale.flat()
}
