const CONSOLE_ROOT = "/dashboard"

/**
 * Inside the console the sidebar carries the theme, the language and the legal
 * pages; everywhere else — sign-in, device flow, status — the footer does.
 */
export function sidebarCarriesChrome(pathname: string): boolean {
  return pathname === CONSOLE_ROOT || pathname.startsWith(`${CONSOLE_ROOT}/`)
}

const APPLE_RE = /mac os x|macintosh|iphone|ipad|ipod/i

/** The key a shortcut is held with, as each system's own keyboard prints it. */
export const SHORTCUT_MODIFIERS = { apple: "⌘", other: "Ctrl" } as const

export function shortcutModifier(userAgent: string): string {
  return APPLE_RE.test(userAgent)
    ? SHORTCUT_MODIFIERS.apple
    : SHORTCUT_MODIFIERS.other
}
