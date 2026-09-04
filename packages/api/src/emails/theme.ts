import {
  DARK,
  LIGHT,
  RADIUS,
  SHADOW_LIGHT,
  SPACE,
  TYPOGRAPHY,
} from "@pupitre/design/tokens"

export const theme = {
  width: "560px",
  color: LIGHT,
  darkColor: DARK,
  radius: RADIUS,
  space: SPACE,
  shadow: SHADOW_LIGHT,
  font: TYPOGRAPHY.ui.fontFamily,
  monoFont: TYPOGRAPHY.data.fontFamily,
  displayFont: TYPOGRAPHY.display.fontFamily,
} as const

/**
 * Inline styles win over a stylesheet, so every dark rule carries `!important`.
 * Clients that ignore `prefers-color-scheme` keep the light theme, which is the
 * one the inline styles already paint.
 */
export const DARK_MODE_CSS = `
:root { color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  .pu-body { background-color: ${DARK.base} !important; }
  .pu-card {
    background-color: ${DARK.surface} !important;
    border-color: ${DARK.line} !important;
  }
  .pu-sunken {
    background-color: ${DARK.sunken} !important;
    border-color: ${DARK.line} !important;
  }
  .pu-mark {
    background-color: ${DARK.inverse} !important;
    color: ${DARK["inverse-ink"]} !important;
  }
  .pu-button {
    background-color: ${DARK.inverse} !important;
  }
  .pu-button a { color: ${DARK["inverse-ink"]} !important; }
  .pu-ink { color: ${DARK.ink} !important; }
  .pu-ink-2 { color: ${DARK["ink-2"]} !important; }
  .pu-ink-3 { color: ${DARK["ink-3"]} !important; }
  .pu-ink-4 { color: ${DARK["ink-4"]} !important; }
  .pu-rule { border-color: ${DARK.line} !important; }
}
`.trim()
