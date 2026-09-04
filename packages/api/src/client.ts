import { treaty } from "@elysiajs/eden"
import {
  isApiErrorBody,
  ApiError as SharedApiError,
} from "@pupitre/shared/api/errors"
import type { Api } from "./server"

export type { Api } from "./server"

export const ApiError = SharedApiError

export type ApiError = SharedApiError

export type ApiFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export interface ApiClientOptions {
  fetch?: ApiFetch
  headers?: HeadersInit
}

export function createApiClient(
  baseUrl: string,
  { fetch: fetcher, headers }: ApiClientOptions = {}
) {
  return treaty<Api>(baseUrl, {
    fetcher: fetcher as typeof fetch | undefined,
    headers: headers === undefined ? undefined : new Headers(headers),
  })
}

export type ApiClient = ReturnType<typeof createApiClient>

interface EdenResponse<T> {
  data: T | null
  error: { status: number; value: unknown } | null
}

function messageOf(status: number, value: unknown): string {
  return isApiErrorBody(value) ? value.error.message : `API error ${status}`
}

export function unwrap<T>(response: EdenResponse<T>): T {
  if (response.error) {
    const { status, value } = response.error

    throw new ApiError(status, value, messageOf(status, value))
  }

  return response.data as T
}
