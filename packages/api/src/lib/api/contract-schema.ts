import {
  type ContractSchema,
  type ContractValue,
  contractJsonSchema,
  type JsonSchema,
} from "@pupitre/shared/contracts/json-schema"
import type { TSchema, TUnsafe } from "@sinclair/typebox"
import { t } from "elysia"

const STRUCTURAL_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "anyOf",
  "enum",
  "const",
])

const SAFE_INTEGER_BOUNDS = new Set<unknown>([
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
])

export class UnsupportedContractError extends Error {}

function keywordsOf(node: JsonSchema): Record<string, unknown> {
  const keywords: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(node)) {
    const zodIntegerBound =
      (key === "minimum" || key === "maximum") && SAFE_INTEGER_BOUNDS.has(value)

    if (!(STRUCTURAL_KEYWORDS.has(key) || zodIntegerBound)) {
      keywords[key] = value
    }
  }

  return keywords
}

function objectOf(node: JsonSchema, keywords: Record<string, unknown>) {
  if (typeof node.additionalProperties === "object") {
    throw new UnsupportedContractError("a record has no TypeBox counterpart")
  }

  const required = new Set((node.required as string[] | undefined) ?? [])
  const properties = Object.entries(
    (node.properties as Record<string, JsonSchema> | undefined) ?? {}
  ).map(([key, child]) => {
    const property = typeBoxOf(child)

    return [key, required.has(key) ? property : t.Optional(property)]
  })

  return t.Object(Object.fromEntries(properties), {
    ...keywords,
    ...(node.additionalProperties === false
      ? { additionalProperties: false }
      : {}),
  })
}

function typedOf(type: unknown, node: JsonSchema): TSchema {
  const keywords = keywordsOf(node)

  switch (type) {
    case "object":
      return objectOf(node, keywords)
    case "array":
      return t.Array(typeBoxOf(node.items as JsonSchema), keywords)
    case "string":
      return t.String(keywords)
    case "integer":
      return t.Integer(keywords)
    case "number":
      return t.Number(keywords)
    case "boolean":
      return t.Boolean(keywords)
    case "null":
      return t.Null()
    default:
      throw new UnsupportedContractError(`type ${String(type)}`)
  }
}

function typeBoxOf(node: JsonSchema): TSchema {
  if (Array.isArray(node.anyOf)) {
    return t.Union(node.anyOf.map(typeBoxOf), keywordsOf(node))
  }

  if ("const" in node) {
    return t.Literal(node.const as string | number | boolean, keywordsOf(node))
  }

  if (Array.isArray(node.enum)) {
    return t.UnionEnum(node.enum as [string, ...string[]], keywordsOf(node))
  }

  if ("$ref" in node) {
    throw new UnsupportedContractError("a reference inside a contract")
  }

  if (Array.isArray(node.type)) {
    return t.Union(node.type.map((type) => typedOf(type, node)))
  }

  return typedOf(node.type, node)
}

/** A shared zod contract as TypeBox: the route keeps its localized validation messages and its OpenAPI, the shape lives once. */
export function fromContract<Schema extends ContractSchema>(
  schema: Schema,
  options: { $id?: string } = {}
): TUnsafe<ContractValue<Schema>> {
  return typeBoxOf({
    ...contractJsonSchema(schema),
    ...options,
  }) as unknown as TUnsafe<ContractValue<Schema>>
}
