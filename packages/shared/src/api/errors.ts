export const API_ERROR_CODES = [] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export class ApiError extends Error {
  readonly body: unknown
  readonly status: number

  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = "ApiError"
    this.body = body
    this.status = status
  }
}
