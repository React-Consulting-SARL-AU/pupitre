const CONSOLE_ROOT = "/dashboard"

/**
 * Inside the console the sidebar carries the theme, the language and the legal
 * pages; everywhere else — sign-in, device flow, status — the footer does.
 */
export function sidebarCarriesChrome(pathname: string): boolean {
  return pathname === CONSOLE_ROOT || pathname.startsWith(`${CONSOLE_ROOT}/`)
}
