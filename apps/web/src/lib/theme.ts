export const THEME_STORAGE_KEY = "pupitre_theme"

export const THEMES = ["system", "light", "dark"] as const

export type Theme = (typeof THEMES)[number]

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "system"
}

export function readStoredTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return "system"
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // A browser that refuses storage still gets the theme for this page.
  }
}

export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === "system") {
    root.removeAttribute("data-theme")

    return
  }

  root.dataset.theme = theme
}

export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`
