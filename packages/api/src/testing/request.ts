import { bootApiTestServer, TEST_BASE_URL } from "./index"

export interface TestResponse<T> {
  status: number
  json: T
  raw: Response
}

const SESSION_COOKIE_RE = /(?:^|,\s*)[^=,]*session_token=([^;]+)/

async function send<T>(
  prefix: string,
  method: string,
  path: string,
  body?: unknown,
  headers?: HeadersInit
): Promise<TestResponse<T>> {
  const { fetch } = await bootApiTestServer()
  const requestHeaders = new Headers(headers)

  if (body !== undefined) {
    requestHeaders.set("content-type", "application/json")
  }

  const raw = await fetch(`${TEST_BASE_URL}${prefix}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await raw.text()
  let json: unknown = null

  if (text.length > 0) {
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
  }

  return { status: raw.status, json: json as T, raw }
}

export function authRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  headers?: HeadersInit
): Promise<TestResponse<T>> {
  return send<T>("/api/auth", method, path, body, headers)
}

export function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  headers?: HeadersInit
): Promise<TestResponse<T>> {
  return send<T>("/api/v1", method, path, body, headers)
}

export function sessionTokenFrom(response: Response): string | null {
  const exposed = response.headers.get("set-auth-token")

  if (exposed) {
    return exposed
  }

  const cookie = response.headers.get("set-cookie")?.match(SESSION_COOKIE_RE)

  return cookie ? decodeURIComponent(cookie[1]) : null
}
