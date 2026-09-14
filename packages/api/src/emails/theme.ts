import { LIGHT, RADIUS, SPACE, TYPOGRAPHY } from "@pupitre/design/tokens"

export const theme = {
  width: 560,
  color: LIGHT,
  radius: RADIUS,
  space: SPACE,
  font: TYPOGRAPHY.ui.fontFamily,
  monoFont: TYPOGRAPHY.data.fontFamily,
  displayFont: TYPOGRAPHY.display.fontFamily,
} as const
