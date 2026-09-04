export const THEME_COOKIE = "pupitre_theme"

export const THEMES = ["system", "light", "dark"] as const

export type Theme = (typeof THEMES)[number]

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

const EXPLICIT_THEMES = THEMES.filter((theme) => theme !== "system")

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "system"
}

export function themeFromCookie(cookie: string): Theme {
  const match = cookie.match(
    new RegExp(`(?:^|; ?)${THEME_COOKIE}=(${THEMES.join("|")})(?:;|$)`)
  )

  return parseTheme(match?.[1])
}

export function themeCookie(theme: Theme, secure: boolean): string {
  const attributes = [
    `${THEME_COOKIE}=${theme}`,
    "path=/",
    `max-age=${ONE_YEAR_SECONDS}`,
    "samesite=lax",
  ]

  if (secure) {
    attributes.push("secure")
  }

  return attributes.join("; ")
}

export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === "system") {
    delete root.dataset.theme
    return
  }

  root.dataset.theme = theme
}

export const THEME_BOOT_SCRIPT = `var m=document.cookie.match(/(?:^|; ?)${THEME_COOKIE}=(${EXPLICIT_THEMES.join("|")})(?:;|$)/);if(m)document.documentElement.dataset.theme=m[1]`
