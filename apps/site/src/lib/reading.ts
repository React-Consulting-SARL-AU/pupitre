import type { Locale } from "./i18n"

const WORDS_PER_MINUTE = 230

const CODE_BLOCK_RE = /```[\s\S]*?```/g
const IMPORT_LINE_RE = /^import .*$/gm
const TAG_RE = /<[^>]*>/g
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu

export function readingMinutes(body: string): number {
  const prose = body
    .replace(CODE_BLOCK_RE, " ")
    .replace(IMPORT_LINE_RE, " ")
    .replace(TAG_RE, " ")

  const count = prose.match(WORD_RE)?.length ?? 0

  return Math.max(1, Math.ceil(count / WORDS_PER_MINUTE))
}

export function readingTime(body: string, locale: Locale): string {
  const format = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  })

  return format.format(readingMinutes(body))
}
