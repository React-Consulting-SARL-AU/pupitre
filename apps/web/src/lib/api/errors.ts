import { ApiError } from "@pupitre/api/client"
import { isApiErrorBody } from "@pupitre/shared/api/errors"

export interface ApiFailure {
  code: string
  status: number
  message: string
  fix: string | null
}

const UNAUTHENTICATED_STATUS = 401

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === UNAUTHENTICATED_STATUS
}

/** The API always says what went wrong and how to fix it; a network cut says nothing. */
export function apiFailure(error: unknown): ApiFailure | null {
  if (!(error instanceof ApiError && isApiErrorBody(error.body))) {
    return null
  }

  return {
    code: error.body.error.code,
    status: error.status,
    message: error.body.error.message,
    fix: error.body.error.fix ?? null,
  }
}
