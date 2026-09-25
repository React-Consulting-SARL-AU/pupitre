const AUTH_BASE_PATH = "/api/auth"

export const USER_CODE_LENGTH = 8

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export interface DeviceFlowOptions {
  fetch?: FetchLike
}

export type DeviceCodeStatus = "pending" | "approved" | "denied"

export interface DeviceCodeLookup {
  status: DeviceCodeStatus
  user_code: string
  expires_at?: string
}

// A code, never a sentence: only the screen knows the reader's language.
export class DeviceCodeError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number) {
    super(code)
    this.name = "DeviceCodeError"
    this.code = code
    this.status = status
  }
}

// Better Auth's code, lowercased, for a sign-in too old to confirm a device.
export const SESSION_NOT_FRESH = "session_not_fresh"

export const DEVICE_PAGE_PATH = "/auth/device"

export function needsFreshSignIn(error: unknown): boolean {
  return error instanceof DeviceCodeError && error.code === SESSION_NOT_FRESH
}

export function normalizeUserCode(value: string): string {
  return value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "")
}

export function formatUserCode(value: string): string {
  const raw = normalizeUserCode(value).slice(0, USER_CODE_LENGTH)

  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw
}

function resolveFetch(options: DeviceFlowOptions): FetchLike {
  return options.fetch ?? ((input, init) => fetch(input, init))
}

function authUrl(baseUrl: string, path: string): string {
  return new URL(`${AUTH_BASE_PATH}${path}`, baseUrl).toString()
}

function codeFor(status: number, payload: unknown): string {
  const raw = (payload as { code?: unknown; error?: unknown } | null)?.code

  if (typeof raw === "string") {
    return raw.toLowerCase()
  }

  if (status === 401) {
    return "unauthenticated"
  }

  if (status === 403) {
    return "forbidden"
  }

  return "unknown"
}

function errorFor(status: number, payload: unknown): DeviceCodeError {
  return new DeviceCodeError(codeFor(status, payload), status)
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()

  if (text.length === 0) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function lookupDeviceCode(
  baseUrl: string,
  userCode: string,
  options: DeviceFlowOptions = {}
): Promise<DeviceCodeLookup> {
  const code = normalizeUserCode(userCode)
  const response = await resolveFetch(options)(
    authUrl(baseUrl, `/device?user_code=${encodeURIComponent(code)}`),
    { headers: { accept: "application/json" }, credentials: "include" }
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw errorFor(response.status, payload)
  }

  return payload as DeviceCodeLookup
}

async function decide(
  baseUrl: string,
  path: string,
  userCode: string,
  options: DeviceFlowOptions
): Promise<void> {
  const response = await resolveFetch(options)(authUrl(baseUrl, path), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ userCode: normalizeUserCode(userCode) }),
  })

  if (!response.ok) {
    throw errorFor(response.status, await readJson(response))
  }
}

export function approveDeviceCode(
  baseUrl: string,
  userCode: string,
  options: DeviceFlowOptions = {}
): Promise<void> {
  return decide(baseUrl, "/device/approve", userCode, options)
}

export function denyDeviceCode(
  baseUrl: string,
  userCode: string,
  options: DeviceFlowOptions = {}
): Promise<void> {
  return decide(baseUrl, "/device/deny", userCode, options)
}
