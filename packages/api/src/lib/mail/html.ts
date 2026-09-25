/** No sanitiser (regex passes are never fixed-point): this CSP blocks all script, and `img-src data:` stops remote tracking pixels. */
export const MAIL_HTML_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox"

export const MAIL_NOSNIFF = "nosniff"
