import { experimental_AstroContainer as AstroContainer } from "astro/container"
import type { AstroComponentFactory } from "astro/runtime/server/index.js"

interface RenderOptions {
  props?: Record<string, unknown>
  slots?: Record<string, string>
  path?: string
}

const DEV_SOURCE_ATTRIBUTES_RE = / data-astro-source-(?:file|loc)="[^"]*"/g

function normalize(html: string): string {
  return html
    .replace(DEV_SOURCE_ATTRIBUTES_RE, "")
    .replace(/>\s+/g, ">")
    .replace(/\s+</g, "<")
}

export async function render(
  component: AstroComponentFactory,
  { props = {}, slots, path = "/" }: RenderOptions = {}
): Promise<string> {
  const container = await AstroContainer.create()
  const html = await container.renderToString(component, {
    props,
    slots,
    request: new Request(`https://pupitre.sh${path}`),
  })

  return normalize(html)
}
