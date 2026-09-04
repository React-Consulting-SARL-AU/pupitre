import type { Locale } from "@pupitre/shared/i18n"
import { ValueErrorType } from "@sinclair/typebox/errors"
import type { ValidationError } from "elysia"
import { type MessageKey, translate } from "../i18n"

interface ValidationDetail {
  message: string
  fix: string
}

const LOCATION_KEYS: Record<string, MessageKey> = {
  body: "location_body",
  query: "location_query",
  params: "location_params",
  headers: "location_headers",
  cookie: "location_cookie",
  response: "location_response",
}

const BOUNDED_REASONS: Partial<
  Record<ValueErrorType, { key: MessageKey; bound: string }>
> = {
  [ValueErrorType.StringMinLength]: {
    key: "reason_min_length",
    bound: "minLength",
  },
  [ValueErrorType.StringMaxLength]: {
    key: "reason_max_length",
    bound: "maxLength",
  },
  [ValueErrorType.NumberMinimum]: { key: "reason_minimum", bound: "minimum" },
  [ValueErrorType.NumberMaximum]: { key: "reason_maximum", bound: "maximum" },
  [ValueErrorType.IntegerMinimum]: { key: "reason_minimum", bound: "minimum" },
  [ValueErrorType.IntegerMaximum]: { key: "reason_maximum", bound: "maximum" },
  [ValueErrorType.ArrayMinItems]: {
    key: "reason_min_items",
    bound: "minItems",
  },
  [ValueErrorType.ArrayMaxItems]: {
    key: "reason_max_items",
    bound: "maxItems",
  },
}

const PLAIN_REASONS: Partial<Record<ValueErrorType, MessageKey>> = {
  [ValueErrorType.ObjectRequiredProperty]: "reason_required",
  [ValueErrorType.String]: "reason_expected_string",
  [ValueErrorType.Number]: "reason_expected_number",
  [ValueErrorType.Integer]: "reason_expected_integer",
  [ValueErrorType.Boolean]: "reason_expected_boolean",
  [ValueErrorType.Object]: "reason_expected_object",
  [ValueErrorType.Array]: "reason_expected_array",
  [ValueErrorType.StringPattern]: "reason_pattern",
  [ValueErrorType.StringFormat]: "reason_pattern",
  [ValueErrorType.Union]: "reason_one_of",
  [ValueErrorType.Literal]: "reason_one_of",
}

function fieldPath(pointer: string): string {
  const path = pointer.split("/").filter(Boolean).join(".")

  return path || "$"
}

function reasonFor(
  locale: Locale,
  type: ValueErrorType,
  schema: Record<string, unknown>
): string {
  const bounded = BOUNDED_REASONS[type]

  if (bounded) {
    return translate(locale, bounded.key, {
      limit: String(schema[bounded.bound] ?? ""),
    })
  }

  return translate(locale, PLAIN_REASONS[type] ?? "reason_invalid")
}

export function describeValidationError(
  error: ValidationError,
  locale: Locale
): ValidationDetail {
  const first = error.all[0]
  const location = translate(
    locale,
    LOCATION_KEYS[error.type] ?? "location_body"
  )

  if (!first) {
    return {
      message: translate(locale, "validation_field", { path: "$", location }),
      fix: translate(locale, "reason_invalid"),
    }
  }

  return {
    message: translate(locale, "validation_field", {
      path: fieldPath(first.path),
      location,
    }),
    fix:
      first.value === undefined
        ? translate(locale, "reason_required")
        : reasonFor(
            locale,
            first.type,
            first.schema as Record<string, unknown>
          ),
  }
}
