import { describe, expect, it } from "bun:test"
import { buildContractSchema, CONTRACT_DEFINITIONS } from "./index"

const EXPECTED = [
  "Request",
  "Event",
  "LogEvent",
  "StepEvent",
  "Response",
  "ProtocolError",
  "ErrorCode",
  "HelloParams",
  "HelloResult",
  "PingParams",
  "PingResult",
  "ProbeResult",
  "InstallParams",
  "InstallResult",
  "SnapshotResult",
  "ProjectUpParams",
  "ProjectUpResult",
  "ProjectGitStatusResult",
  "AgentOpenParams",
  "SecretsSetParams",
  "DbDumpParams",
  "AgentUpgradeParams",
  "DiagResult",
  "Manifest",
  "Field",
  "Preset",
]

describe("CONTRACT_DEFINITIONS", () => {
  it("names the envelope, every params and result, and the catalogue", () => {
    for (const name of EXPECTED) {
      expect(Object.keys(CONTRACT_DEFINITIONS)).toContain(name)
    }
  })
})

describe("buildContractSchema", () => {
  const schema = buildContractSchema()

  it("is one document with named definitions and a protocol version", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(schema.protocol).toBe(1)
    for (const name of EXPECTED) {
      expect(schema.$defs[name]).toBeDefined()
      expect(schema.$defs[name]?.$id).toBeUndefined()
    }
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
