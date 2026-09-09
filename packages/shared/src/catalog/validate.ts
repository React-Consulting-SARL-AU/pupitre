import { z } from "zod"
import { type FieldFormat, matchesFormat, normalized } from "./formats"
import type { Field, Manifest } from "./index"

/**
 * What a configuration gets wrong, in one shape for both sides.
 *
 * The app computes these to keep an install from leaving, and the agent
 * computes them again before its first step. The rules live here so the two can
 * never drift; the fixtures next door are what proves they haven't.
 */

export const FIELD_PROBLEM_CODES = [
  "required",
  "type",
  "min",
  "max",
  "min_length",
  "max_length",
  "options",
  "format",
  "pattern",
  "connection",
] as const

export const FieldProblemCodeSchema = z.enum(FIELD_PROBLEM_CODES)

export type FieldProblemCode = z.infer<typeof FieldProblemCodeSchema>

/**
 * `field` is empty when the problem is the module's own — a connection it
 * requires and nobody has given. `message` is filled by whoever crosses the
 * wire; a problem computed in the app carries none, its screen has the words.
 */
export const FieldProblemSchema = z.object({
  module: z.string(),
  field: z.string(),
  code: FieldProblemCodeSchema,
  expected: z.string().optional(),
  message: z.string().optional(),
})

export type FieldProblem = z.infer<typeof FieldProblemSchema>

/** How many values are held for a secret field: 0, 1, or the length of a list. */
export type SecretsHeld = (moduleId: string, key: string) => number

export type ConfigValues = Record<string, Record<string, unknown>>

function problem(
  moduleId: string,
  key: string,
  code: FieldProblemCode,
  expected?: string
): FieldProblem {
  return expected === undefined
    ? { code, field: key, module: moduleId }
    : { code, expected, field: key, module: moduleId }
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === ""
}

function numberOf(value: unknown): number | null {
  if (typeof value === "boolean") {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function bounds(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) {
    return `${min}–${max}`
  }

  return String(min ?? max)
}

function textProblem(
  moduleId: string,
  field: Field,
  raw: string
): FieldProblem | null {
  if (field.min_length !== undefined && raw.length < field.min_length) {
    return problem(moduleId, field.key, "min_length", String(field.min_length))
  }

  if (field.max_length !== undefined && raw.length > field.max_length) {
    return problem(moduleId, field.key, "max_length", String(field.max_length))
  }

  if (field.format && !matchesFormat(field.format as FieldFormat, raw)) {
    return problem(moduleId, field.key, "format", field.format)
  }

  if (field.pattern && !new RegExp(field.pattern).test(raw.trim())) {
    return problem(moduleId, field.key, "pattern", field.pattern)
  }

  return null
}

function listProblem(
  moduleId: string,
  field: Field,
  value: unknown,
  held: SecretsHeld
): FieldProblem | null {
  if (field.kind !== "list") {
    return null
  }

  const least = Math.max(field.min ?? 0, field.required ? 1 : 0)

  const items =
    field.items === "secret"
      ? new Array<string>(held(moduleId, field.key)).fill("held")
      : (Array.isArray(value) ? value : [])
          .map((item) => String(item).trim())
          .filter((item) => item !== "")

  if (items.length < least) {
    return problem(moduleId, field.key, "required", String(least))
  }

  if (field.max !== undefined && items.length > field.max) {
    return problem(moduleId, field.key, "max", String(field.max))
  }

  if (field.items === "secret") {
    return null
  }

  for (const item of items) {
    const wrong = textProblem(moduleId, field, item)

    if (wrong) {
      return wrong
    }
  }

  return null
}

function optionProblem(
  moduleId: string,
  field: Field,
  value: unknown
): FieldProblem | null {
  const options =
    field.kind === "version" || field.kind === "select"
      ? (field.options ?? [])
      : []

  if (options.length === 0) {
    return null
  }

  return options.includes(String(value ?? ""))
    ? null
    : problem(moduleId, field.key, "options", options.join(", "))
}

function numberProblem(
  moduleId: string,
  field: Field,
  value: unknown
): FieldProblem | null {
  const parsed = numberOf(value)

  if (parsed === null || !Number.isInteger(parsed)) {
    return problem(moduleId, field.key, "type", "number")
  }

  const min = "min" in field ? field.min : undefined
  const max = "max" in field ? field.max : undefined

  if (min !== undefined && parsed < min) {
    return problem(moduleId, field.key, "min", bounds(min, max))
  }

  if (max !== undefined && parsed > max) {
    return problem(moduleId, field.key, "max", bounds(min, max))
  }

  return textProblem(moduleId, field, String(parsed))
}

/**
 * One field against one value, and nothing else — a `managed` field is the
 * caller's business, and a module that was never selected has no fields.
 */
export function validateField(
  moduleId: string,
  field: Field,
  value: unknown,
  held: SecretsHeld
): FieldProblem | null {
  if (field.kind === "version") {
    return optionProblem(moduleId, field, value)
  }

  if (field.kind === "boolean") {
    return value === undefined || typeof value === "boolean"
      ? null
      : problem(moduleId, field.key, "type", "boolean")
  }

  if (field.kind === "secret") {
    return field.required && held(moduleId, field.key) === 0
      ? problem(moduleId, field.key, "required")
      : null
  }

  if (field.kind === "list") {
    return listProblem(moduleId, field, value, held)
  }

  if (blank(value)) {
    return field.required ? problem(moduleId, field.key, "required") : null
  }

  if (field.kind === "select") {
    return optionProblem(moduleId, field, value)
  }

  if (field.kind === "number") {
    return numberProblem(moduleId, field, value)
  }

  return textProblem(moduleId, field, String(value).trim())
}

/** The value a module will actually read: what was sent, and the manifest's own default when nothing was. */
export function resolved(
  field: Field,
  values: Record<string, unknown>
): unknown {
  const sent = values[field.key]

  if (sent !== undefined && sent !== null) {
    return sent
  }

  return "default" in field ? field.default : undefined
}

export interface ValidateOptions {
  /** Whether the app holds the connection a manifest requires, when it does. */
  connected?: (kind: string) => boolean
  /** Fields the caller supplies itself — the app fills every `managed` one. */
  skipManaged?: boolean
  /**
   * Modules to be installed without being configured. Nothing of theirs is
   * weighed: there is no answer to judge, and the point of deferring is that
   * the reader has not given one yet.
   */
  deferred?: readonly string[]
}

/**
 * The whole selection, in the order the modules were given.
 *
 * A module's connection is checked before its fields: being asked to fill a
 * domain for a tunnel that has no account behind it helps nobody.
 */
export function validateConfig(
  manifests: readonly Manifest[],
  selection: readonly string[],
  values: ConfigValues,
  held: SecretsHeld,
  options: ValidateOptions = {}
): FieldProblem[] {
  const chosen = new Set(selection)
  const later = new Set(options.deferred ?? [])
  const problems: FieldProblem[] = []

  for (const manifest of manifests) {
    if (!chosen.has(manifest.id) || later.has(manifest.id)) {
      continue
    }

    if (
      manifest.connection &&
      options.connected &&
      !options.connected(manifest.connection)
    ) {
      problems.push(problem(manifest.id, "", "connection", manifest.connection))
      continue
    }

    for (const field of manifest.fields) {
      if (options.skipManaged && field.managed === true) {
        continue
      }

      const wrong = validateField(
        manifest.id,
        field,
        resolved(field, values[manifest.id] ?? {}),
        held
      )

      if (wrong) {
        problems.push(wrong)
      }
    }
  }

  return problems
}

/** What a value becomes once accepted: trimmed, and lowered where a shape says so. */
export function normalizedValue(field: Field, value: unknown): unknown {
  if (typeof value !== "string" || !field.format) {
    return value
  }

  return normalized(field.format as FieldFormat, value)
}
