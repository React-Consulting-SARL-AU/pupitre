import { MARK, type MarkColors } from "../src/brand"
import { wordmark } from "./wordmark"

/**
 * The mark and the word side by side, or stacked.
 *
 * Both are built on the mark's 1024 grid, and both align the word by its cap
 * height rather than by its line box: a lockup that centres on the line box
 * sits visibly high, because "Pupitre" has a descender and no capital below the
 * baseline.
 */
const CAP = 0.377
const GAP = 0.286
const STACKED_WIDTH = 1.3
const STACKED_GAP = 0.22

const round = (value: number): number => Math.round(value * 1000) / 1000

function word(paths: string[], color: string, transform: string): string {
  const outlines = paths.map((d) => `    <path d="${d}" />`).join("\n")

  return `  <g fill="${color}" transform="${transform}">
${outlines}
  </g>`
}

function frame(width: number, height: number, body: string): string {
  return `<svg viewBox="0 0 ${round(width)} ${round(height)}" xmlns="http://www.w3.org/2000/svg">
  <title>Pupitre</title>
${body}
</svg>
`
}

function square(colors: MarkColors): string {
  return `  <rect width="${MARK.grid}" height="${MARK.grid}" rx="${MARK.radius}" fill="${colors.square}" />
  <g fill="none" stroke="${colors.glyph}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${MARK.stroke}">
    <path d="${MARK.chevron}" />
    <path d="${MARK.underscore}" />
  </g>`
}

export async function lockupSvg(colors: MarkColors): Promise<string> {
  const { paths, cap } = await wordmark()

  const scale = (MARK.grid * CAP) / cap.height
  const left = MARK.grid * (1 + GAP)
  const top = MARK.grid / 2 - (MARK.grid * CAP) / 2

  const transform = `translate(${round(left - cap.x * scale)} ${round(top - cap.y * scale)}) scale(${round(scale)})`

  return frame(
    left + cap.width * scale,
    MARK.grid,
    `${square(colors)}\n${word(paths, colors.square, transform)}`
  )
}

export async function stackedLockupSvg(colors: MarkColors): Promise<string> {
  const { paths, cap, ink } = await wordmark()

  const width = MARK.grid * STACKED_WIDTH
  const scale = width / cap.width
  const top = MARK.grid * (1 + STACKED_GAP)
  const descender = ink.y + ink.height - (cap.y + cap.height)

  const transform = `translate(${round(-cap.x * scale)} ${round(top - cap.y * scale)}) scale(${round(scale)})`

  return frame(
    width,
    top + (cap.height + descender) * scale,
    `  <g transform="translate(${round((width - MARK.grid) / 2)} 0)">
${square(colors)
  .split("\n")
  .map((line) => `  ${line}`)
  .join("\n")}
  </g>
${word(paths, colors.square, transform)}`
  )
}

export async function wordmarkSvg(color: string): Promise<string> {
  const { paths, cap, ink } = await wordmark()

  return frame(
    cap.width,
    ink.height,
    word(paths, color, `translate(${round(-cap.x)} ${round(-ink.y)})`)
  )
}
