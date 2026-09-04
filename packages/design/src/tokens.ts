/**
 * The same colours as `tokens.css`, for the consumers that cannot read CSS.
 *
 * The Electron main process paints the native window before any stylesheet
 * exists, and a canvas has no computed style to ask. Both need the values as
 * data. `tokens.test.ts` checks these records against the frontmatter of
 * `docs/product/DESIGN.md`, the same source `tokens.css` is checked against, so
 * the two forms cannot drift apart.
 */
export interface ThemeColors {
  base: string
  surface: string
  sunken: string
  raised: string
  ink: string
  "ink-2": string
  "ink-3": string
  "ink-4": string
  line: string
  "line-strong": string
  inverse: string
  "inverse-ink": string
  ok: string
  warn: string
  danger: string
}

export const LIGHT: ThemeColors = {
  base: "#ffffff",
  surface: "#f7f7f7",
  sunken: "#efefef",
  raised: "#e6e6e6",
  ink: "#0a0a0a",
  "ink-2": "#4a4a4a",
  "ink-3": "#767676",
  "ink-4": "#a3a3a3",
  line: "#e3e3e3",
  "line-strong": "#c9c9c9",
  inverse: "#0a0a0a",
  "inverse-ink": "#ffffff",
  ok: "#1f7a45",
  warn: "#9a6a00",
  danger: "#b3362a",
}

export const DARK: ThemeColors = {
  base: "#0a0a0a",
  surface: "#111111",
  sunken: "#161616",
  raised: "#1e1e1e",
  ink: "#f5f5f5",
  "ink-2": "#c4c4c4",
  "ink-3": "#8f8f8f",
  "ink-4": "#5c5c5c",
  line: "#232323",
  "line-strong": "#353535",
  inverse: "#f5f5f5",
  "inverse-ink": "#0a0a0a",
  ok: "#4fbe85",
  warn: "#d9a320",
  danger: "#e8705a",
}
