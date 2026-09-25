import { z } from "zod"

export type ContractSchema = z.ZodType

export type ContractValue<Schema extends ContractSchema> = z.output<Schema>

export interface JsonSchema {
  [key: string]: unknown
}

export function contractJsonSchema(schema: ContractSchema): JsonSchema {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "throw",
  }) as JsonSchema

  return rest
}
