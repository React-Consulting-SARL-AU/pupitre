import { useCallback, useEffect, useState } from "react"
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  type Theme,
} from "@/lib/theme"

export interface ThemeControl {
  theme: Theme
  setTheme: (next: Theme) => void
}

export function useTheme(): ThemeControl {
  const [theme, setThemeState] = useState<Theme>("system")

  useEffect(() => {
    setThemeState(readStoredTheme())
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    storeTheme(next)
    applyTheme(document.documentElement, next)
  }, [])

  return { theme, setTheme }
}
