import { MAIL_TRUSTED_AUTHSERV_ID } from "@pupitre/shared/legal"

export interface MailHeader {
  key: string
  value: string
}

interface MethodResult {
  method: string
  result: string
  properties: Map<string, string>
}

interface AuthenticationResults {
  authservId: string
  results: MethodResult[]
}

const RESULT_HEADERS = [
  "arc-authentication-results",
  "authentication-results",
] as const

const COMMENT_RE = /\([^()]*\)/g

const ARC_INSTANCE_RE = /^i=\d+$/i

const WHITESPACE_RE = /\s+/

const QUOTES_RE = /^"|"$/g

function withoutComments(value: string): string {
  let current = value
  let previous = ""

  while (current !== previous) {
    previous = current
    current = current.replace(COMMENT_RE, " ")
  }

  return current
}

function methodResultOf(clause: string): MethodResult | null {
  const [head, ...rest] = clause.split(WHITESPACE_RE)
  const [method, result] = (head ?? "").toLowerCase().split("=")

  if (!(method && result)) {
    return null
  }

  const properties = new Map<string, string>()

  for (const token of rest) {
    const at = token.indexOf("=")

    if (at > 0) {
      properties.set(
        token.slice(0, at).toLowerCase(),
        token
          .slice(at + 1)
          .replace(QUOTES_RE, "")
          .toLowerCase()
      )
    }
  }

  return { method, result, properties }
}

/** RFC 8601, and the ARC form of it that opens on its instance `i=N`. */
function parseResults(value: string): AuthenticationResults {
  const clauses = withoutComments(value)
    .split(";")
    .map((clause) => clause.trim())
    .filter(Boolean)

  if (clauses[0] && ARC_INSTANCE_RE.test(clauses[0])) {
    clauses.shift()
  }

  const [authserv = "", ...methods] = clauses

  return {
    authservId: (authserv.split(WHITESPACE_RE)[0] ?? "").toLowerCase(),
    results: methods
      .map(methodResultOf)
      .filter((result): result is MethodResult => result !== null),
  }
}

function domainOf(address: string | undefined): string {
  return (address?.split("@").pop() ?? "").toLowerCase()
}

/** Relaxed alignment: one domain is the other, or sits under it. */
function aligned(one: string, other: string): boolean {
  return (
    one !== "" &&
    other !== "" &&
    (one === other || one.endsWith(`.${other}`) || other.endsWith(`.${one}`))
  )
}

function vouchesFor(result: MethodResult, domain: string): boolean {
  if (result.result !== "pass") {
    return false
  }

  switch (result.method) {
    case "dmarc":
      return result.properties.get("header.from") === domain
    case "dkim":
      return aligned(domain, result.properties.get("header.d") ?? "")
    case "spf":
      return aligned(domain, domainOf(result.properties.get("smtp.mailfrom")))
    default:
      return false
  }
}

/**
 * The receiving MX prepends its own results, so only the topmost header of
 * each name can be its: one copied lower by the sender, even under our
 * authserv-id, never counts. Every topmost header our MX wrote must vouch for
 * the `From` domain through DMARC, or an aligned DKIM or SPF pass.
 */
export function isAuthenticatedSender(
  headers: MailHeader[],
  fromEmail: string | null
): boolean {
  const domain = domainOf(fromEmail ?? undefined)

  if (!(fromEmail && domain)) {
    return false
  }

  const trusted = RESULT_HEADERS.flatMap((key) => {
    const topmost = headers.find((header) => header.key === key)
    const parsed = topmost ? parseResults(topmost.value) : null

    return parsed?.authservId === MAIL_TRUSTED_AUTHSERV_ID ? [parsed] : []
  })

  return (
    trusted.length > 0 &&
    trusted.every((parsed) =>
      parsed.results.some((result) => vouchesFor(result, domain))
    )
  )
}
