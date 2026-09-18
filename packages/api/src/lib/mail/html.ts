/**
 * There is no sanitiser. A regex pass over hostile HTML cannot be made
 * fixed-point — `<scri<script>pt>` reconstitutes the tag the pass just removed
 * — and a half-lock reads as a lock. What holds instead: `script-src` falls
 * back to `default-src 'none'`, so no inline script, no event handler and no
 * `javascript:` URL runs, and the console frames the body under an empty
 * `sandbox`. The body is served exactly as it arrived.
 */
export const MAIL_HTML_CSP =
  "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; frame-ancestors 'self'"

export const MAIL_NOSNIFF = "nosniff"
