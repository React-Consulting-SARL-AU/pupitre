import type { APIRoute } from "astro"
import { ogImage } from "../../lib/og"
import { ogPages } from "../../lib/og-pages"

export async function getStaticPaths() {
  const pages = await ogPages()

  return pages.map((page) => ({
    params: { slug: page.slug },
    props: { card: page.card },
  }))
}

export const GET: APIRoute = async ({ props }) => {
  const png = await ogImage(props.card)

  return new Response(png as BodyInit, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  })
}
