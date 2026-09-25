const LOOSE_SVG_RE = /<svg(?![^>]*(?:role="img"|aria-hidden="true"))/g

export function undeclaredVectors(html: string): string[] {
  return [...(html.match(LOOSE_SVG_RE) ?? [])]
}
