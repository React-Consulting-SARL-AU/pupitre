export interface QuotedBody {
  /** What the person actually wrote this time. */
  visible: string
  /** The quoted history and the signature, folded away until asked for. */
  quoted: string | null
}

const QUOTE_LINE_RE = /^\s*>/

/** `-- ` on its own line opens a signature, per RFC 3676. */
const SIGNATURE_LINE_RE = /^--\s?$/

/** "Le 3 mars 2026 à 10:12, Ada a écrit :" and "On Mar 3, 2026, Ada wrote:" */
const ATTRIBUTION_RES = [
  /^\s*le\s.+\s(?:a\s|ont\s)écrit\s?:\s*$/i,
  /^\s*on\s.+\swrote\s?:\s*$/i,
  /^\s*-{2,}\s*message d'origine\s*-{2,}\s*$/i,
  /^\s*-{2,}\s*original message\s*-{2,}\s*$/i,
]

function opensQuote(line: string): boolean {
  return (
    QUOTE_LINE_RE.test(line) ||
    SIGNATURE_LINE_RE.test(line) ||
    ATTRIBUTION_RES.some((pattern) => pattern.test(line))
  )
}

function trimTrailingBlanks(lines: string[]): string[] {
  let end = lines.length

  while (end > 0 && lines[end - 1].trim() === "") {
    end -= 1
  }

  return lines.slice(0, end)
}

/**
 * Where the answer stops and the history starts: a quote makes a three-line
 * reply read as a page, so only the first part is shown until asked for.
 */
export function splitQuotedBody(text: string): QuotedBody {
  const lines = text.split("\n")
  const start = lines.findIndex((line) => opensQuote(line))

  if (start === -1) {
    return { visible: text, quoted: null }
  }

  const quoted = trimTrailingBlanks(lines.slice(start)).join("\n")

  return {
    visible: trimTrailingBlanks(lines.slice(0, start)).join("\n"),
    quoted: quoted === "" ? null : quoted,
  }
}
