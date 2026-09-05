import { useCallback, useSyncExternalStore } from "react"
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

/**
 * One value for the whole page: the footer, the sidebar and the settings card
 * all show the same theme, and one of them changing it moves the others.
 */
const listeners = new Set<() => void>()

let current: Theme | null = null

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): Theme {
  if (current === null) {
    current = readStoredTheme()
  }

  return current
}

/** The server has no browser storage to read, and paints the system theme. */
function serverSnapshot(): Theme {
  return "system"
}

export function useTheme(): ThemeControl {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot)

  const setTheme = useCallback((next: Theme) => {
    current = next
    storeTheme(next)
    applyTheme(document.documentElement, next)

    for (const listener of listeners) {
      listener()
    }
  }, [])

  return { theme, setTheme }
}
