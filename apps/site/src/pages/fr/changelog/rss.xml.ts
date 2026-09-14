import { getCollection } from "astro:content"
import rss from "@astrojs/rss"
import { byVersionDesc } from "../../../lib/changelog"
import { feedLanguage } from "../../../lib/feeds"
import { localizePath, translator } from "../../../lib/i18n"
import { canonicalUrl, SITE_URL } from "../../../lib/seo"

const LOCALE = "fr"

export async function GET() {
  const t = translator(LOCALE)
  const entries = byVersionDesc(
    await getCollection("changelog", (entry) => entry.data.locale === LOCALE),
    (entry) => entry.data.version
  )

  return rss({
    title: `${t("site.name")} — ${t("changelog.label")}`,
    description: t("changelog.description"),
    site: SITE_URL,
    customData: `<language>${feedLanguage(LOCALE)}</language>`,
    items: entries.map((entry) => ({
      title: `${entry.data.version} — ${entry.data.title}`,
      description: entry.data.description,
      pubDate: entry.data.date,
      link: canonicalUrl(
        `${localizePath("/changelog/", LOCALE)}#${entry.data.version}`
      ),
    })),
  })
}
