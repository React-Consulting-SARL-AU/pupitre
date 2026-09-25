import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { LOCALES, localizePath } from "./i18n"
import { canonicalUrl } from "./seo"

export const SECURITY_TXT_PATH = "/.well-known/security.txt"

/** RFC 9116 wants the file to expire within a year; every deploy renews it. */
export const SECURITY_TXT_VALID_DAYS = 180

const DAY_MS = 86_400_000

export function securityTxt(now: Date): string {
  const expires = new Date(now.getTime() + SECURITY_TXT_VALID_DAYS * DAY_MS)
  const policies = LOCALES.map(
    (locale) =>
      `Policy: ${canonicalUrl(localizePath("/legal/security/", locale))}`
  )

  return [
    `Contact: mailto:${LEGAL_CONTACTS.security}`,
    `Expires: ${expires.toISOString()}`,
    ...policies,
    `Preferred-Languages: ${LOCALES.join(", ")}`,
    `Canonical: ${canonicalUrl(SECURITY_TXT_PATH)}`,
    "",
  ].join("\n")
}
