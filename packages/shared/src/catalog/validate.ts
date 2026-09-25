import { z } from "zod"
import { type FieldFormat, matchesFormat } from "./formats"
import type { Field, Manifest } from "./index"

const FIELD_PROBLEM_CODES = [
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

const FieldProblemCodeSchema = z.enum(FIELD_PROBLEM_CODES)

export type FieldProblemCode = z.infer<typeof FieldProblemCodeSchema>

export const FieldProblemSchema = z.object({
  module: z.string(),
  // Empty when the problem is the module's own, such as a missing connection.
  field: z.string(),
  code: FieldProblemCodeSchema,
  expected: z.string().optional(),
  // Filled only when the problem crosses the wire; the app's screens have their own words.
  message: z.string().optional(),
})

export type FieldProblem = z.infer<typeof FieldProblemSchema>

// A caller that only knows how many values are held cannot have them weighed against a pattern.
export type SecretsHeld = (
  moduleId: string,
  key: string
) => number | readonly string[]

function heldItems(
  held: SecretsHeld,
  moduleId: string,
  key: string
): { count: number; items: string[] } {
  const kept = held(moduleId, key)

  if (typeof kept === "number") {
    return { count: kept, items: [] }
  }

  const items = kept.map((item) => item.trim()).filter((item) => item !== "")

  return { count: items.length, items }
}

// A line break or a nul would end the configuration line a secret is written into.
const SECRET_PATTERN = "^[^\\r\\n\\x00]*$"

const SECRET_LINE_BREAK_RE = /[\r\n\0]/

function secretProblem(
  held: SecretsHeld,
  moduleId: string,
  key: string
): FieldProblem | null {
  const kept = held(moduleId, key)
  const broken =
    typeof kept !== "number" &&
    kept.some((value) => SECRET_LINE_BREAK_RE.test(value))

  return broken ? problem(moduleId, key, "pattern", SECRET_PATTERN) : null
}

type ConfigValues = Record<string, Record<string, unknown>>

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

function textItems(value: unknown): { count: number; items: string[] } {
  const items = (Array.isArray(value) ? value : [])
    .map((item) => String(item).trim())
    .filter((item) => item !== "")

  return { count: items.length, items }
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

  if (field.items === "secret") {
    const broken = secretProblem(held, moduleId, field.key)

    if (broken) {
      return broken
    }
  }

  const { count, items } =
    field.items === "secret"
      ? heldItems(held, moduleId, field.key)
      : textItems(value)

  if (count < least) {
    return problem(moduleId, field.key, "required", String(least))
  }

  if (field.max !== undefined && count > field.max) {
    return problem(moduleId, field.key, "max", String(field.max))
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

function versionsProblem(
  moduleId: string,
  field: Field,
  value: unknown
): FieldProblem | null {
  if (field.kind !== "versions") {
    return null
  }

  if (value !== undefined && value !== null && !Array.isArray(value)) {
    return problem(moduleId, field.key, "type", "list")
  }

  const { items } = textItems(value)

  if (items.length === 0) {
    return problem(moduleId, field.key, "required", "1")
  }

  return items.every((item) => field.options.includes(item))
    ? null
    : problem(moduleId, field.key, "options", field.options.join(", "))
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

export function validateField(
  moduleId: string,
  field: Field,
  value: unknown,
  held: SecretsHeld
): FieldProblem | null {
  if (field.kind === "version") {
    return optionProblem(moduleId, field, value)
  }

  if (field.kind === "versions") {
    return versionsProblem(moduleId, field, value)
  }

  if (field.kind === "boolean") {
    return value === undefined || typeof value === "boolean"
      ? null
      : problem(moduleId, field.key, "type", "boolean")
  }

  if (field.kind === "secret") {
    return field.required && heldItems(held, moduleId, field.key).count === 0
      ? problem(moduleId, field.key, "required")
      : secretProblem(held, moduleId, field.key)
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

interface ValidateOptions {
  connected?: (kind: string) => boolean
  skipManaged?: boolean
  // Installed without being configured: there is no answer yet to weigh.
  deferred?: readonly string[]
}

// A module's connection is checked before its fields: a domain for a tunnel with no account helps nobody.
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
