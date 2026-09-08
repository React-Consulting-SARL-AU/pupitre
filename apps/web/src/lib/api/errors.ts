import { ApiError } from "@pupitre/api/client"
import { isApiErrorBody } from "@pupitre/shared/api/errors"

export interface ApiFailure {
  message: string
  fix: string | null
}

/** The API always says what went wrong and how to fix it; a network cut says nothing. */
export function apiFailure(error: unknown): ApiFailure | null {
  if (!(error instanceof ApiError && isApiErrorBody(error.body))) {
    return null
  }

  return {
    message: error.body.error.message,
    fix: error.body.error.fix ?? null,
  }
}
