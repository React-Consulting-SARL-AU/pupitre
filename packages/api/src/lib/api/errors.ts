import type { ApiErrorCode } from "@pupitre/shared/api/errors"

export interface ApiErrorPayload {
  error: {
    code: ApiErrorCode
    message: string
    fix?: string
  }
}

const ERROR_REF_BYTES = 6

export function apiError(
  code: ApiErrorCode,
  message: string,
  fix?: string
): ApiErrorPayload {
  return {
    error: fix === undefined ? { code, message } : { code, message, fix },
  }
}

export function createErrorRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ERROR_REF_BYTES))

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}
