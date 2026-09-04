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

export interface Typography {
  ui: { fontFamily: string; fontSize: string; lineHeight: number }
  data: { fontFamily: string; fontSize: string }
  label: { fontSize: string; letterSpacing: string; textTransform: string }
  display: { fontFamily: string; fontWeight: number; letterSpacing: string }
}

export const TYPOGRAPHY: Typography = {
  ui: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Helvetica Neue', sans-serif",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  data: {
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "12px",
  },
  label: {
    fontSize: "10.5px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  display: {
    fontFamily: "'Bricolage Grotesque', -apple-system, sans-serif",
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
}

export interface Radius {
  sm: string
  md: string
  lg: string
  full: string
}

export const RADIUS: Radius = {
  sm: "6px",
  md: "10px",
  lg: "14px",
  full: "999px",
}

/**
 * A 4 px scale, plus the two distances that carry the hierarchy: `gutter`
 * between the blocks of one group, `section` between two sections.
 */
export const SPACE: Readonly<Record<string, string>> = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
  8: "32px",
  12: "48px",
  16: "64px",
  24: "96px",
  gutter: "20px",
  section: "32px",
}

export interface Elevation {
  flat: string
  raised: string
  overlay: string
}

export const SHADOW_LIGHT: Elevation = {
  flat: "none",
  raised: "0 1px 2px rgb(0 0 0 / .05), 0 1px 3px rgb(0 0 0 / .06)",
  overlay: "0 4px 12px rgb(0 0 0 / .08), 0 12px 32px rgb(0 0 0 / .10)",
}

export const SHADOW_DARK: Elevation = {
  flat: "none",
  raised: "0 1px 2px rgb(0 0 0 / .5), 0 1px 3px rgb(0 0 0 / .4)",
  overlay: "0 4px 12px rgb(0 0 0 / .5), 0 12px 32px rgb(0 0 0 / .55)",
}

export interface Motion {
  fast: string
  soft: string
  breathe: string
}

export const MOTION: Motion = {
  fast: "120ms ease",
  soft: "180ms cubic-bezier(.2,.6,.3,1)",
  breathe: "1.6s ease-in-out infinite",
}
