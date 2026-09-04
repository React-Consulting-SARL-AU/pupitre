import { API_ERROR_CODES } from "@pupitre/shared/api/errors"
import type { TSchema } from "@sinclair/typebox"
import { t } from "elysia"

export const errorResponse = t.Object(
  {
    error: t.Object({
      code: t.UnionEnum([...API_ERROR_CODES]),
      message: t.String(),
      fix: t.Optional(t.String()),
    }),
  },
  { $id: "ApiError" }
)

export const dateTime = t.String({ format: "date-time" })

const authErrors = {
  401: errorResponse,
  403: errorResponse,
} as const

export function withAuthErrors<T extends Record<number, TSchema>>(
  responses: T
) {
  return { ...authErrors, ...responses } as typeof authErrors & T
}

function nameFrom(itemSchema: TSchema, suffix: string, name?: string) {
  if (name) {
    return name
  }

  return typeof itemSchema.$id === "string"
    ? `${itemSchema.$id}${suffix}`
    : undefined
}

export function dataResponse<T extends TSchema>(itemSchema: T, name?: string) {
  const $id = nameFrom(itemSchema, "Envelope", name)

  return t.Object({ data: itemSchema }, $id ? { $id } : {})
}

export function paginatedResponse<T extends TSchema>(
  itemSchema: T,
  name?: string
) {
  const $id = nameFrom(itemSchema, "List", name)

  return t.Object(
    { data: t.Array(itemSchema), total: t.Integer() },
    $id ? { $id } : {}
  )
}
