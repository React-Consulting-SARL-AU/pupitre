/**
 * There is no sanitiser. A regex pass over hostile HTML cannot be made
 * fixed-point — `<scri<script>pt>` reconstitutes the tag the pass just removed
 * — and a half-lock reads as a lock. What holds instead: `script-src` falls
 * back to `default-src 'none'`, so no inline script, no event handler and no
 * `javascript:` URL runs, and the console frames the body under an empty
 * `sandbox`. The body is served exactly as it arrived.
 *
 * `img-src` stops at `data:`: a remote pixel in a mail written to `security@`
 * would otherwise tell its sender the hour it was read and the address it was
 * read from. An attachment is opened from the band above the body instead.
 *
 * `sandbox` holds even when the body is opened outside the console's frame.
 */
export const MAIL_HTML_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox"

export const MAIL_NOSNIFF = "nosniff"
