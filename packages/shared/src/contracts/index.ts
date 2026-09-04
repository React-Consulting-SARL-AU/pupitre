import { z } from "zod"
import { COMMAND_NAMES, COMMANDS, RESTRICTED_COMMANDS } from "../agent-protocol"
import {
  EventSchema,
  LogEventSchema,
  PROTOCOL_VERSION,
  RequestSchema,
  ResponseSchema,
  StepEventSchema,
} from "../agent-protocol/envelope"
import {
  ProtocolErrorCodeSchema,
  ProtocolErrorSchema,
} from "../agent-protocol/errors"
import { InstallSecretsSchema } from "../agent-protocol/install"
import { SecretEventSchema } from "../agent-protocol/secrets"
import { FieldSchema, ManifestSchema, PRESETS, PresetSchema } from "../catalog"

export const CONTRACT_ID = "https://pupitre.studio/contracts/agent/schema.json"

const COMMAND_SEPARATOR_RE = /[._]/

type JsonObject = Record<string, unknown>

export interface ContractSchema {
  $schema: string
  $id: string
  title: string
  protocol: number
  $defs: Record<string, JsonObject | undefined>
}

function definitionName(cmd: string, suffix: "Params" | "Result"): string {
  const pascal = cmd
    .split(COMMAND_SEPARATOR_RE)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")

  return `${pascal}${suffix}`
}

function commandDefinitions(): Record<string, z.ZodType> {
  const definitions: Record<string, z.ZodType> = {}

  for (const cmd of COMMAND_NAMES) {
    definitions[definitionName(cmd, "Params")] = COMMANDS[cmd].params
    definitions[definitionName(cmd, "Result")] = COMMANDS[cmd].result
  }

  return definitions
}

export const CONTRACT_DEFINITIONS: Readonly<Record<string, z.ZodType>> = {
  Request: RequestSchema,
  Event: EventSchema,
  LogEvent: LogEventSchema,
  StepEvent: StepEventSchema,
  SecretEvent: SecretEventSchema,
  Response: ResponseSchema,
  ProtocolError: ProtocolErrorSchema,
  ErrorCode: ProtocolErrorCodeSchema,
  RestrictedCommands: z.enum(RESTRICTED_COMMANDS),
  ...commandDefinitions(),
  InstallSecrets: InstallSecretsSchema,
  Manifest: ManifestSchema,
  Field: FieldSchema,
  Preset: PresetSchema,
}

export const CONTRACT_CONSTANTS: Readonly<Record<string, JsonObject>> = {
  Presets: {
    type: "array",
    items: { $ref: "#/$defs/Preset" },
    const: PRESETS,
  },
}

function stripDocumentKeys(schema: JsonObject): JsonObject {
  const { $schema: _schema, $id: _id, ...rest } = schema

  return rest
}

export function buildContractSchema(): ContractSchema {
  const registry = z.registry<{ id: string }>()

  for (const [name, schema] of Object.entries(CONTRACT_DEFINITIONS)) {
    registry.add(schema, { id: name })
  }

  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/$defs/${id}`,
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  })

  const $defs: Record<string, JsonObject> = {}

  for (const name of Object.keys(CONTRACT_DEFINITIONS)) {
    $defs[name] = stripDocumentKeys(schemas[name] as JsonObject)
  }

  for (const [name, definition] of Object.entries(CONTRACT_CONSTANTS)) {
    $defs[name] = definition
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: CONTRACT_ID,
    title: "Pupitre agent contract",
    protocol: PROTOCOL_VERSION,
    $defs,
  }
}

export function renderContractSchema(): string {
  return `${JSON.stringify(buildContractSchema(), null, 2)}\n`
}
