import type { FIELD_FORMATS } from "./index"

/**
 * The expression each format holds a value to.
 *
 * Every pattern here is written in the subset both JavaScript and Go's RE2
 * accept — no lookaround, no backreference — because the agent runs the same
 * rules on the same values and the two must never disagree.
 */

export type FieldFormat = (typeof FIELD_FORMATS)[number]

const LABEL = "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"

export const FORMAT_PATTERNS: Record<FieldFormat, string> = {
  domain: `^${LABEL}(\\.${LABEL})+$`,
  email: `^[a-z0-9._%+-]+@${LABEL}(\\.${LABEL})+$`,
  hostname: `^${LABEL}(\\.${LABEL})*$`,
  identifier: "^[a-z_][a-z0-9_]{0,62}$",
  path: "^/([A-Za-z0-9._~@+-]+/?)*$",
  port: "^[0-9]{1,5}$",
  size: "^[0-9]+[KkMmGg]?[Bb]?$",
  timezone: "^(UTC|[A-Za-z][A-Za-z_+-]*(/[A-Za-z0-9][A-Za-z0-9_+-]*){1,2})$",
  url: "^https?://[^\\s]+$",
}

const PORT_MIN = 1
const PORT_MAX = 65_535

/** A hostname or a domain is compared in lower case: a zone is not two zones. */
export function normalized(format: FieldFormat, value: string): string {
  if (format === "domain" || format === "hostname" || format === "email") {
    return value.trim().toLowerCase()
  }

  return value.trim()
}

export function matchesFormat(format: FieldFormat, value: string): boolean {
  const candidate = normalized(format, value)

  if (!new RegExp(FORMAT_PATTERNS[format]).test(candidate)) {
    return false
  }

  if (format === "port") {
    const port = Number(candidate)

    return port >= PORT_MIN && port <= PORT_MAX
  }

  return true
}
