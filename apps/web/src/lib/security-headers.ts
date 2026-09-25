const PRESIGNED_R2_ORIGIN = "https://*.r2.cloudflarestorage.com"

const NONCE_BYTES = 16

function documentContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' data: blob: ${PRESIGNED_R2_ORIGIN}`,
    `frame-src 'self' ${PRESIGNED_R2_ORIGIN}`,
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}'`,
    `connect-src 'self' ${PRESIGNED_R2_ORIGIN}`,
    "upgrade-insecure-requests",
  ].join("; ")
}

export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))

  return btoa(String.fromCharCode(...bytes))
}

// A socket upgrade answers with a body the runtime owns: copying it into a fresh Response drops the connection.
function isUpgrade(response: Response): boolean {
  return (
    response.status === 101 ||
    (response.webSocket !== undefined && response.webSocket !== null)
  )
}

export function withSecurityHeaders(
  response: Response,
  env: Pick<CloudflareEnv, "PUPITRE_ENVIRONMENT">,
  { nonce }: { nonce: string | null }
): Response {
  if (isUpgrade(response)) {
    return response
  }

  const headers = new Headers(response.headers)

  if (nonce) {
    headers.set("content-security-policy", documentContentSecurityPolicy(nonce))
    headers.set("x-frame-options", "DENY")
  }

  headers.set("x-content-type-options", "nosniff")
  headers.set("referrer-policy", "strict-origin-when-cross-origin")
  headers.set("cross-origin-opener-policy", "same-origin")
  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  )

  // Local development runs on plain http: the browser must not be told to refuse it for two years afterwards.
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
