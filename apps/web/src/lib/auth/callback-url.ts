export const DEFAULT_CALLBACK_URL = "/dashboard"

const REWRITTEN_BY_BROWSERS = /[\p{Cc}\\]/u
const MAX_DECODE_PASSES = 4

function fullyDecoded(path: string): string | null {
  let current = path

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    let next: string

    try {
      next = decodeURIComponent(current)
    } catch {
      return null
    }

    if (next === current) {
      return current
    }

    current = next
  }

  return null
}

function isPlainPath(path: string): boolean {
  const decoded = fullyDecoded(path)

  if (decoded === null) {
    return false
  }

  return (
    decoded.startsWith("/") &&
    !decoded.startsWith("//") &&
    !REWRITTEN_BY_BROWSERS.test(decoded)
  )
}

function sameOriginPath(value: string, origin: string): string | null {
  if (REWRITTEN_BY_BROWSERS.test(value)) {
    return null
  }

  const target = new URL(value, origin)

  if (target.origin !== origin || !isPlainPath(target.pathname)) {
    return null
  }

  const path = `${target.pathname}${target.search}`

  return new URL(path, origin).origin === origin ? path : null
}

// Off-origin destinations are dropped: an open redirect behind a sign-in is a phishing tool.
export function safeCallbackUrl(value: unknown, origin: string): string {
  if (typeof value !== "string" || value === "") {
    return DEFAULT_CALLBACK_URL
  }

  try {
    return sameOriginPath(value, origin) ?? DEFAULT_CALLBACK_URL
  } catch {
    return DEFAULT_CALLBACK_URL
  }
}
