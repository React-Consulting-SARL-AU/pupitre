import { readFileSync } from "node:fs"
import path from "node:path"

export const HEADERS_FILE = "public/_headers"

const CSP_HEADER = "content-security-policy"

const SPACES_RE = /\s+/

/**
 * The header file is served as it is written: nothing derives it from the
 * constants at build time, so a test reads it back and holds the origins the
 * pages actually call.
 */
export function contentSecurityPolicy(content: string): string | null {
  for (const line of content.split("\n")) {
    const separator = line.indexOf(":")

    if (separator === -1) {
      continue
    }

    if (line.slice(0, separator).trim().toLowerCase() === CSP_HEADER) {
      return line.slice(separator + 1).trim()
    }
  }

  return null
}

export function cspDirective(policy: string, name: string): string[] {
  for (const directive of policy.split(";")) {
    const [found, ...values] = directive.trim().split(SPACES_RE)

    if (found === name) {
      return values
    }
  }

  return []
}

export function siteHeaders(root: string): string {
  return readFileSync(path.join(root, HEADERS_FILE), "utf8")
}
