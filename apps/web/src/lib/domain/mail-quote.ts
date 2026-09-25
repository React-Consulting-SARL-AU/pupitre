export interface QuotedBody {
  visible: string
  quoted: string | null
}

const QUOTE_LINE_RE = /^\s*>/

// `-- ` on its own line opens a signature, per RFC 3676.
const SIGNATURE_LINE_RE = /^--\s?$/

// Reply attributions such as "On Mar 3, 2026, Ada wrote:", in English and French.
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
