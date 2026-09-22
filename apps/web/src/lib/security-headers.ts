/**
 * The headers of what the Worker itself answers. The documents the console
 * renders carry the full policy; the API's answers carry the interdictions
 * that mean something on a JSON body — its one HTML page, the OpenAPI docs,
 * loads its scripts from where it pleases. The static copies in
 * `public/_headers` carry the rest, on the responses the assets layer serves
 * without the Worker.
 *
 * The policy mirrors the site's, with one concession the site does not make:
 * TanStack Start hydrates through inline scripts it streams with the document,
 * so scripts accept 'unsafe-inline'. Everything a policy can still forbid —
 * framing, plug-ins, other origins — stays forbidden: Google Fonts is the sole
 * external origin beside the presigned R2 addresses the inbox's attachments
 * come from.
 */
const DOCUMENT_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
  "upgrade-insecure-requests",
].join("; ")

/**
 * A socket upgrade answers with a body the runtime owns; copying it into a
 * fresh Response would drop the connection it just agreed to.
 */
function isUpgrade(response: Response): boolean {
  return (
    response.status === 101 ||
    (response.webSocket !== undefined && response.webSocket !== null)
  )
}

export function withSecurityHeaders(
  response: Response,
  env: Pick<CloudflareEnv, "PUPITRE_ENVIRONMENT">,
  { document }: { document: boolean }
): Response {
  if (isUpgrade(response)) {
    return response
  }

  const headers = new Headers(response.headers)

  if (document) {
    headers.set("content-security-policy", DOCUMENT_CONTENT_SECURITY_POLICY)
    headers.set("x-frame-options", "DENY")
  }

  headers.set("x-content-type-options", "nosniff")
  headers.set("referrer-policy", "strict-origin-when-cross-origin")
  headers.set("cross-origin-opener-policy", "same-origin")
  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  )

  // Local development runs on plain http: the browser must not be told to
  // refuse it for two years afterwards.
  if (env.PUPITRE_ENVIRONMENT === "production") {
    headers.set(
      "strict-transport-security",
      "max-age=63072000; includeSubDomains"
    )
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
