export const DESKTOP_CLIENT_ID = "pupitre-desktop"

const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"
const AUTH_BASE_PATH = "/api/auth"

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export interface DeviceFlowOptions {
  clientId?: string
  fetch?: FetchLike
}

export interface DeviceFlowStart {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

export type DeviceFlowPoll =
  | { status: "authorized"; token: string; expires_in: number }
  | { status: "authorization_pending" | "slow_down" | "expired" | "denied" }

export class DeviceFlowError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "DeviceFlowError"
    this.code = code
  }
}

/** The device grant answers OAuth's `error`; a sign-in Better Auth refuses answers its own `code` and `message`. */
interface ErrorPayload {
  error?: string
  error_description?: string
  code?: string
  message?: string
}

function authUrl(baseUrl: string, path: string): string {
  return new URL(`${AUTH_BASE_PATH}${path}`, baseUrl).toString()
}

function resolveFetch(options: DeviceFlowOptions): FetchLike {
  return options.fetch ?? ((input, init) => fetch(input, init))
}

async function postJson<T>(
  fetchImpl: FetchLike,
  url: string,
  body: Record<string, string>
): Promise<{ ok: boolean; payload: T & ErrorPayload }> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  })
  const text = await response.text()

  try {
    return { ok: response.ok, payload: JSON.parse(text) as T & ErrorPayload }
  } catch {
    throw new DeviceFlowError(
      "unexpected_answer",
      `HTTP ${response.status}, no JSON body`
    )
  }
}

function errorOf(payload: ErrorPayload, fallback: string): DeviceFlowError {
  const code = payload.error ?? payload.code ?? fallback

  return new DeviceFlowError(
    code,
    payload.error_description ?? payload.message ?? code
  )
}

export async function startDeviceFlow(
  baseUrl: string,
  options: DeviceFlowOptions = {}
): Promise<DeviceFlowStart> {
  const { ok, payload } = await postJson<DeviceFlowStart>(
    resolveFetch(options),
    authUrl(baseUrl, "/device/code"),
    { client_id: options.clientId ?? DESKTOP_CLIENT_ID }
  )

  if (!ok) {
    throw errorOf(payload, "invalid_request")
  }

  return payload
}

interface TokenPayload {
  access_token: string
  token_type: string
  expires_in: number
}

export async function pollDeviceFlow(
  baseUrl: string,
  deviceCode: string,
  options: DeviceFlowOptions = {}
): Promise<DeviceFlowPoll> {
  const { ok, payload } = await postJson<TokenPayload>(
    resolveFetch(options),
    authUrl(baseUrl, "/device/token"),
    {
      grant_type: DEVICE_GRANT_TYPE,
      device_code: deviceCode,
      client_id: options.clientId ?? DESKTOP_CLIENT_ID,
    }
  )

  if (ok) {
    return {
      status: "authorized",
      token: payload.access_token,
      expires_in: payload.expires_in,
    }
  }

  switch (payload.error) {
    case "authorization_pending":
    case "slow_down":
      return { status: payload.error }
    case "expired_token":
      return { status: "expired" }
    case "access_denied":
      return { status: "denied" }
    default:
      throw errorOf(payload, "invalid_grant")
  }
}

export function fetchWithBearer(
  token: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init)
): FetchLike {
  return (input, init) => {
    const headers = new Headers(init?.headers)

    headers.set("authorization", `Bearer ${token}`)

    return fetchImpl(input, { ...init, headers })
  }
}
