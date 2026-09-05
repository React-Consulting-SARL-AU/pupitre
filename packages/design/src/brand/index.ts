/**
 * The mark: the prompt glyph `>_` in a square with `md` corners.
 *
 * Everything that carries the brand is drawn from here — the app icon, the
 * favicon, the lockups, the files uploaded to Stripe — so the geometry lives in
 * one place and nothing drifts. The 1024 grid is the app-icon grid; every other
 * size is this one scaled.
 *
 * On that grid the glyph's inked box, round caps included, is exactly centred:
 * 257 → 767 horizontally, 321 → 703 vertically.
 */
export const MARK = {
  grid: 1024,
  radius: 256,
  stroke: 86,
  chevron: "M 300 364 L 448 512 L 300 660",
  underscore: "M 556 660 L 724 660",
} as const

/**
 * The small cut: the same drawing, bigger and heavier.
 *
 * Below about 24 pixels the chevron of the normal cut falls under two pixels a
 * stroke and closes into a blob. Growing the glyph and thickening the line
 * keeps the two arms apart in a browser tab, and the mark still reads as
 * itself next to the large one.
 */
export const COMPACT = { glyph: 1.15, stroke: 1.35 } as const

export interface MarkColors {
  square: string
  glyph: string
}

/** Near-black square, white glyph. Goes on a white or light background. */
export const ON_LIGHT: MarkColors = { square: "#0a0a0a", glyph: "#ffffff" }

/** Near-white square, black glyph. Goes on a black or dark background. */
export const ON_DARK: MarkColors = { square: "#f5f5f5", glyph: "#0a0a0a" }

export interface MarkOptions {
  colors?: MarkColors
  /** Side of the viewBox. The square fills it unless `inset` says otherwise. */
  canvas?: number
  /** Margin between the edge of the viewBox and the square. */
  inset?: number
  /** Corner radius of the square. Defaults to the `md` ratio of its side. */
  radius?: number
  /** `width` and `height` attributes. Left out when absent, so the SVG scales. */
  size?: number
  /**
   * A full-bleed rectangle behind the square. Painted in the square's own
   * colour it makes the corners disappear, which is what a maskable icon and a
   * round avatar both want.
   */
  background?: string
  /** Draws the small cut. Worth it at 24 pixels and under, wrong above. */
  compact?: boolean
  /**
   * Swaps the two colours under `prefers-color-scheme: dark` instead of fixing
   * them. What a favicon wants, and what an uploaded file never does.
   */
  adaptive?: boolean
  title?: string
}

const round = (value: number): number => Math.round(value * 1000) / 1000

function glyph(
  scale: number,
  offset: number,
  stroke: string,
  compact = false
): string {
  const centre = MARK.grid / 2
  const grow = compact ? COMPACT.glyph : 1
  const width = MARK.stroke * (compact ? COMPACT.stroke : 1)

  const moves = [
    offset === 0 && scale === 1
      ? ""
      : `translate(${round(offset)} ${round(offset)}) scale(${round(scale)})`,
    grow === 1
      ? ""
      : `translate(${round(centre * (1 - grow))} ${round(centre * (1 - grow))}) scale(${grow})`,
  ].filter(Boolean)

  const transform = moves.length ? ` transform="${moves.join(" ")}"` : ""

  return `  <g${transform} fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${round(width)}">
    <path d="${MARK.chevron}" />
    <path d="${MARK.underscore}" />
  </g>`
}

/**
 * The mark as a standalone SVG document, ready to be written to a file or
 * handed to a rasteriser.
 */
export function markSvg(options: MarkOptions = {}): string {
  const {
    colors = ON_LIGHT,
    canvas = MARK.grid,
    inset = 0,
    size,
    background,
    compact = false,
    adaptive = false,
    title = "Pupitre",
  } = options

  const side = canvas - 2 * inset
  const scale = side / MARK.grid
  const radius = options.radius ?? side * (MARK.radius / MARK.grid)

  const dimensions = size ? ` width="${size}" height="${size}"` : ""
  const square = adaptive ? "" : ` fill="${colors.square}"`
  const stroke = adaptive ? "currentColor" : colors.glyph

  const bleed = background
    ? `  <rect width="${canvas}" height="${canvas}" fill="${background}" />\n`
    : ""

  const style = adaptive
    ? `  <style>
    rect { fill: ${ON_LIGHT.square}; }
    g { color: ${ON_LIGHT.glyph}; }
    @media (prefers-color-scheme: dark) {
      rect { fill: ${ON_DARK.square}; }
      g { color: ${ON_DARK.glyph}; }
    }
  </style>
`
    : ""

  return `<svg${dimensions} viewBox="0 0 ${canvas} ${canvas}" xmlns="http://www.w3.org/2000/svg">
  <title>${title}</title>
${style}${bleed}  <rect x="${round(inset)}" y="${round(inset)}" width="${round(side)}" height="${round(side)}" rx="${round(radius)}"${square} />
${glyph(scale, inset, stroke, compact)}
</svg>
`
}

/**
 * The glyph alone, no square, no background. For a surface that already carries
 * the brand's black or white, and for anything that has to be recoloured.
 */
export function glyphSvg(color = ON_LIGHT.square, size?: number): string {
  const box = { x: 257, y: 321, width: 510, height: 382 }
  const dimensions = size
    ? ` width="${size}" height="${round((size * box.height) / box.width)}"`
    : ""

  return `<svg${dimensions} viewBox="${box.x} ${box.y} ${box.width} ${box.height}" xmlns="http://www.w3.org/2000/svg">
  <title>Pupitre</title>
${glyph(1, 0, color)}
</svg>
`
}
