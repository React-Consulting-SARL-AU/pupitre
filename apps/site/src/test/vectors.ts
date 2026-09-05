const LOOSE_SVG_RE = /<svg(?![^>]*(?:role="img"|aria-hidden="true"))/g

/**
 * A page draws no photograph, and every vector on it is declared: a service
 * logo carries `role="img"` and its brand name, an interface icon carries
 * `aria-hidden`. Anything else is decoration, which the site does not do.
 */
export function undeclaredVectors(html: string): string[] {
  return [...(html.match(LOOSE_SVG_RE) ?? [])]
}
