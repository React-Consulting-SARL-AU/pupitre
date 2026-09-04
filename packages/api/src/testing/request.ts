import type { Locale } from "@pupitre/shared/i18n"
import { bootApiTestServer, TEST_BASE_URL } from "./index"

export interface TestResponse<T> {
  status: number
  json: T
  raw: Response
}

export interface ApiRequestInit {
  method?: string
  body?: unknown
  headers?: HeadersInit
  session?: { token: string } | null
  bearer?: string
  locale?: Locale
}

const SESSION_COOKIE_RE = /(?:^|,\s*)[^=,]*session_token=([^;]+)/

async function send<T>(
  url: string,
  method: string,
  body: unknown,
  headers: Headers
): Promise<TestResponse<T>> {
  const { fetch } = await bootApiTestServer()

  if (body !== undefined) {
    headers.set("content-type", "application/json")
  }

  const raw = await fetch(url, {
    method,
    headers,
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

export function apiRequest<T = unknown>(
  path: string,
  init: ApiRequestInit = {}
): Promise<TestResponse<T>> {
  const headers = new Headers(init.headers)
  const bearer = init.bearer ?? init.session?.token

  if (bearer) {
    headers.set("authorization", `Bearer ${bearer}`)
  }

  if (init.locale) {
    headers.set("accept-language", init.locale)
  }

  return send<T>(
    `${TEST_BASE_URL}/api/v1${path}`,
    init.method ?? (init.body === undefined ? "GET" : "POST"),
    init.body,
    headers
  )
}

export function authRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  headers?: HeadersInit
): Promise<TestResponse<T>> {
  return send<T>(
    `${TEST_BASE_URL}/api/auth${path}`,
    method,
    body,
    new Headers(headers)
  )
}

export function sessionTokenFrom(response: Response): string | null {
  const exposed = response.headers.get("set-auth-token")

  if (exposed) {
    return exposed
  }

  const cookie = response.headers.get("set-cookie")?.match(SESSION_COOKIE_RE)

  return cookie ? decodeURIComponent(cookie[1]) : null
}

const EXPIRED_COOKIE_RE = /(?:^|;\s*)(?:max-age=0|expires=thu,\s*01 jan 1970)/i

export class CookieJar {
  private readonly values = new Map<string, string>()

  absorb(response: Response): this {
    for (const entry of response.headers.getSetCookie()) {
      const [pair] = entry.split(";")
      const separator = pair.indexOf("=")
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()

      if (value === "" || EXPIRED_COOKIE_RE.test(entry)) {
        this.values.delete(name)
      } else {
        this.values.set(name, value)
      }
    }

    return this
  }

  get header(): string {
    return [...this.values]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ")
  }

  get names(): string[] {
    return [...this.values.keys()]
  }
}
