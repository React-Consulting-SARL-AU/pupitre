import { appUrlFromEnv } from "../lib/billing/config"

export const EMAIL_FROM =
  process.env.EMAIL_FROM?.trim() || "no-reply@pupitre.studio"

export const EMAIL_DOMAIN = "pupitre.studio"

export function consoleUrl(): string {
  return appUrlFromEnv()
}

export function consolePath(path: string): string {
  return `${consoleUrl()}${path}`
}
