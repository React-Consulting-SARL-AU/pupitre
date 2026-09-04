export const EMAIL_FROM =
  process.env.EMAIL_FROM?.trim() || "no-reply@pupitre.studio"

export const EMAIL_DOMAIN = "pupitre.studio"

const DEFAULT_CONSOLE_URL = "https://app.pupitre.studio"

const TRAILING_SLASH_RE = /\/+$/

export function consoleUrl(): string {
  const configured = process.env.VITE_APP_URL || process.env.BETTER_AUTH_URL

  if (!configured) {
    return DEFAULT_CONSOLE_URL
  }

  try {
    return new URL(configured).origin
  } catch {
    return configured.trim().replace(TRAILING_SLASH_RE, "")
  }
}

export function consolePath(path: string): string {
  return `${consoleUrl()}${path}`
}
