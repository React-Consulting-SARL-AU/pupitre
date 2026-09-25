// tokens.css as data, for what paints before any stylesheet exists (Electron window, canvas).
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
  frost: string
  "frost-soft": string
}

export const LIGHT: ThemeColors = {
  base: "#ffffff",
  surface: "#f7f7f7",
  sunken: "#efefef",
  raised: "#e6e6e6",
  ink: "#0a0a0a",
  "ink-2": "#4a4a4a",
  "ink-3": "#676767",
  "ink-4": "#838383",
  line: "#e3e3e3",
  "line-strong": "#c9c9c9",
  inverse: "#0a0a0a",
  "inverse-ink": "#ffffff",
  ok: "#1f7a45",
  warn: "#8a5f00",
  danger: "#b3362a",
  frost: "#2f6cae",
  "frost-soft": "#bfdcf3",
}

export const DARK: ThemeColors = {
  base: "#0a0a0a",
  surface: "#111111",
  sunken: "#161616",
  raised: "#1e1e1e",
  ink: "#f5f5f5",
  "ink-2": "#c4c4c4",
  "ink-3": "#8f8f8f",
  "ink-4": "#696969",
  line: "#232323",
  "line-strong": "#353535",
  inverse: "#f5f5f5",
  "inverse-ink": "#0a0a0a",
  ok: "#4fbe85",
  warn: "#d9a320",
  danger: "#e8705a",
  frost: "#a6d4f2",
  "frost-soft": "#5a97cf",
}

interface Typography {
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

interface Radius {
  xs: string
  sm: string
  md: string
  lg: string
  xl: string
  full: string
}

export const RADIUS: Radius = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "18px",
  xl: "24px",
  full: "999px",
}

// `gutter` separates the blocks of one group, `section` two sections.
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
