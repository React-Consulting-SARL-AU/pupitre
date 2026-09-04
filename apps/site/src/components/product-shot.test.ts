import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import ProductShot from "./ProductShot.astro"

const props = {
  src: "/shots/dashboard",
  alt: "The dashboard with two servers online",
  width: 1920,
  height: 1200,
}

const SOURCE_RE = /<source[^>]*>/g
const IMG_RE = /<img[^>]*>/

function attribute(html: string, name: string): string | undefined {
  return html.match(new RegExp(`${name}="([^"]*)"`))?.[1]
}

function img(html: string): string {
  return html.match(IMG_RE)?.[0] ?? ""
}

describe("ProductShot", () => {
  it("renders a picture with AVIF then WebP sources at four widths", async () => {
    const html = await render(ProductShot, { props })
    const sources = [...html.matchAll(SOURCE_RE)].map((m) => m[0])

    expect(html).toContain("<picture>")
    expect(sources).toHaveLength(2)
    expect(attribute(sources[0], "type")).toBe("image/avif")
    expect(attribute(sources[1], "type")).toBe("image/webp")
    expect(attribute(sources[0], "srcset")).toBe(
      "/shots/dashboard-480.avif 480w, /shots/dashboard-960.avif 960w, /shots/dashboard-1440.avif 1440w, /shots/dashboard-1920.avif 1920w"
    )
    expect(attribute(sources[1], "srcset")).toBe(
      "/shots/dashboard-480.webp 480w, /shots/dashboard-960.webp 960w, /shots/dashboard-1440.webp 1440w, /shots/dashboard-1920.webp 1920w"
    )
    expect(attribute(sources[0], "sizes")).toBe(
      "(min-width: 1024px) 960px, 100vw"
    )
    expect(attribute(sources[1], "sizes")).toBe(attribute(sources[0], "sizes"))
  })

  it("gives the img intrinsic dimensions, a WebP fallback and lazy loading", async () => {
    const html = await render(ProductShot, { props })
    const tag = img(html)

    expect(attribute(tag, "src")).toBe("/shots/dashboard-1920.webp")
    expect(attribute(tag, "alt")).toBe(props.alt)
    expect(attribute(tag, "width")).toBe("1920")
    expect(attribute(tag, "height")).toBe("1200")
    expect(attribute(tag, "loading")).toBe("lazy")
    expect(attribute(tag, "decoding")).toBe("async")
    expect(tag).not.toContain("fetchpriority")
  })

  it("loads eagerly with high priority when marked priority", async () => {
    const html = await render(ProductShot, {
      props: { ...props, priority: true },
    })
    const tag = img(html)

    expect(attribute(tag, "loading")).toBe("eager")
    expect(attribute(tag, "fetchpriority")).toBe("high")
  })

  it("accepts custom sizes and a caption", async () => {
    const html = await render(ProductShot, {
      props: { ...props, sizes: "50vw" },
      slots: { default: "Two servers, one online." },
    })

    expect(html).toContain('sizes="50vw"')
    expect(html).toContain(
      '<figcaption class="mt-2 text-ink-3">Two servers, one online.</figcaption>'
    )
  })
})
