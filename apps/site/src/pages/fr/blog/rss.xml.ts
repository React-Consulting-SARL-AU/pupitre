import { getCollection } from "astro:content"
import rss from "@astrojs/rss"
import { docSlug } from "../../../lib/docs"
import { byNewest, feedLanguage } from "../../../lib/feeds"
import { localizePath, translator } from "../../../lib/i18n"
import { canonicalUrl } from "../../../lib/seo"

const LOCALE = "fr"

export async function GET() {
  const t = translator(LOCALE)
  const posts = await getCollection(
    "blog",
    (entry) => entry.data.locale === LOCALE
  )

  return rss({
    title: `${t("site.name")} — ${t("blog.label")}`,
    description: t("blog.description"),
    site: canonicalUrl(localizePath("/blog/", LOCALE)),
    customData: `<language>${feedLanguage(LOCALE)}</language>`,
    items: byNewest(
      posts.map((post) => ({
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        link: canonicalUrl(localizePath(`/blog/${docSlug(post.id)}/`, LOCALE)),
      }))
    ),
  })
}
