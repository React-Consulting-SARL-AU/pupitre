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

// Module-level store, so every theme control on the page moves together.
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
