import { DARK, LIGHT } from "../tokens"

// The inked glyph, round caps included, is exactly centred on the grid: 257 → 767, 321 → 703.
export const MARK = {
  grid: 1024,
  radius: 256,
  stroke: 86,
  chevron: "M 300 364 L 448 512 L 300 660",
  underscore: "M 556 660 L 724 660",
} as const

// Below ~24 px the normal chevron's stroke drops under two pixels and closes into a blob.
export const COMPACT = { glyph: 1.15, stroke: 1.35 } as const

export interface MarkColors {
  square: string
  glyph: string
}

export const ON_LIGHT: MarkColors = {
  square: LIGHT.inverse,
  glyph: LIGHT["inverse-ink"],
}

export const ON_DARK: MarkColors = {
  square: DARK.inverse,
  glyph: DARK["inverse-ink"],
}

interface MarkOptions {
  colors?: MarkColors
  canvas?: number
  inset?: number
  radius?: number
  // Left out when absent, so the SVG scales.
  size?: number
  // Painted in the square's colour, it hides the corners for a maskable icon or a round avatar.
  background?: string
  // Worth it at 24 px and under, wrong above.
  compact?: boolean
  // Follows prefers-color-scheme: right for a favicon, never for an uploaded file.
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
