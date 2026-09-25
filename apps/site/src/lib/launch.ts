import { ANNOUNCED_LAUNCH_ENDS_AT } from "@pupitre/shared/plans"
import type { Locale } from "./i18n"

export const LAUNCH_ENDS_AT = new Date(ANNOUNCED_LAUNCH_ENDS_AT)

export function isLaunchOpen(now: Date = new Date()): boolean {
  return now.getTime() < LAUNCH_ENDS_AT.getTime()
}

export function launchEndDate(locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(LAUNCH_ENDS_AT)
}
