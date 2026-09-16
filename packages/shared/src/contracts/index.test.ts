import { describe, expect, it } from "bun:test"
import { RESTRICTED_COMMANDS, UNENROLLED_COMMANDS } from "../agent-protocol"
import { PROTOCOL_VERSION } from "../agent-protocol/envelope"
import {
  MANDATORY_MODULE_IDS,
  MODULE_IDS,
  PRESETS,
  RUNTIME_TOOLS,
} from "../catalog"
import {
  buildContractSchema,
  CONTRACT_CONSTANTS,
  CONTRACT_DEFINITIONS,
} from "./index"

const EXPECTED = [
  "Request",
  "Event",
  "LogEvent",
  "StepEvent",
  "Response",
  "ProtocolError",
  "ErrorCode",
  "RestrictedCommands",
  "UnenrolledCommands",
  "HelloParams",
  "HelloResult",
  "PingParams",
  "PingResult",
  "ProbeResult",
  "InstallParams",
  "InstallSecrets",
  "InstallResult",
  "SnapshotResult",
  "ProjectUpParams",
  "ProjectUpResult",
  "ProjectGitStatusResult",
  "AgentOpenParams",
  "DbDumpParams",
  "AgentUpgradeParams",
  "EnrollParams",
  "EnrollSecrets",
  "EnrollResult",
  "DiagResult",
  "Manifest",
  "Field",
  "Preset",
  "Presets",
  "RuntimeTools",
]

describe("CONTRACT_DEFINITIONS", () => {
  it("names the envelope, every params and result, and the catalogue", () => {
    const names = Object.keys({
      ...CONTRACT_DEFINITIONS,
      ...CONTRACT_CONSTANTS,
    })

    for (const name of EXPECTED) {
      expect(names).toContain(name)
    }
  })
})

describe("buildContractSchema", () => {
  const schema = buildContractSchema()

  it("is one document with named definitions and a protocol version", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(schema.protocol).toBe(PROTOCOL_VERSION)
    for (const name of EXPECTED) {
      expect(schema.$defs[name]).toBeDefined()
      expect(schema.$defs[name]?.$id).toBeUndefined()
    }
  })

  it("exports the restricted commands as a string enum", () => {
    expect(schema.$defs.RestrictedCommands).toEqual({
      type: "string",
      enum: [...RESTRICTED_COMMANDS],
    })
  })

  it("exports the unenrolled commands and the mandatory modules", () => {
    expect(schema.$defs.UnenrolledCommands).toEqual({
      type: "string",
      enum: [...UNENROLLED_COMMANDS],
    })
    expect(schema.$defs.MandatoryModules).toEqual({
      type: "array",
      items: { type: "string" },
      const: [...MANDATORY_MODULE_IDS],
    })
    expect(schema.$defs.ModuleIds).toEqual({
      type: "array",
      items: { type: "string" },
      const: [...MODULE_IDS],
    })
    expect(schema.$defs.RuntimeTools).toEqual({
      type: "array",
      items: { type: "string" },
      const: [...RUNTIME_TOOLS],
    })
  })

  it("exports the presets with their content as a const", () => {
    expect(schema.$defs.Presets).toEqual({
      type: "array",
      items: { $ref: "#/$defs/Preset" },
      const: PRESETS,
    })
  })

  it("references shared definitions instead of inlining them", () => {
    expect(JSON.stringify(schema.$defs.Manifest)).toContain('"#/$defs/Field"')
    expect(JSON.stringify(schema.$defs.Response)).toContain(
      '"#/$defs/ProtocolError"'
    )
  })

  it("only references definitions that exist", () => {
    const refs = JSON.stringify(schema).match(/"#\/\$defs\/([A-Za-z]+)"/g) ?? []

    for (const ref of refs) {
      const name = ref.slice('"#/$defs/'.length, -1)
      expect(schema.$defs[name]).toBeDefined()
    }
  })

  it("is deterministic", () => {
    expect(JSON.stringify(buildContractSchema())).toBe(JSON.stringify(schema))
  })
})
