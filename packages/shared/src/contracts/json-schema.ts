import { z } from "zod"

export type ContractSchema = z.ZodType

export type ContractValue<Schema extends ContractSchema> = z.output<Schema>

export interface JsonSchema {
  [key: string]: unknown
}

/** A contract as JSON Schema, for a consumer that validates without zod: the API's TypeBox, the agent's validator. */
export function contractJsonSchema(schema: ContractSchema): JsonSchema {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "throw",
  }) as JsonSchema

  return rest
}
