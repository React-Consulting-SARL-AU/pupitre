import { describe, expect, it } from "bun:test"
import { matchesFormat } from "./formats"
import { FIELD_FORMATS, FieldSchema, type Manifest } from "./index"
import {
  type FieldProblemCode,
  validateConfig,
  validateField,
} from "./validate"
import fixtures from "./validate.fixtures.json"

const MODULE = "tool.demo"

function manifest(over: Partial<Manifest> = {}): Manifest {
  return {
    arch: ["amd64"],
    category: "tool",
    conflicts: [],
    fields: [],
    id: MODULE,
    mandatory: false,
    name: "Demo",
    requires: [],
    resources: { disk_mb: 0, ram_mb: 0 },
    runs: false,
    since: "0.1.0",
    summary: "A module for the tests",
    ...over,
  }
}

describe("the cases shared with the agent", () => {
  it("declares a valid field for each case", () => {
    for (const single of fixtures.cases) {
      const parsed = FieldSchema.safeParse(single.field)

      expect(`${single.name}: ${parsed.success}`).toBe(`${single.name}: true`)
    }
  })

  for (const single of fixtures.cases) {
    it(single.name, () => {
      const field = FieldSchema.parse(single.field)
      const held = () => single.held ?? 0
      const problem = validateField(MODULE, field, single.value, held)

      expect(problem?.code ?? null).toBe(
        single.expect as FieldProblemCode | null
      )
    })
  }
})

describe("a list of secrets", () => {
  const providers = FieldSchema.parse({
    items: "secret",
    key: "providers",
    kind: "list",
    label: "Fournisseurs",
    max: 8,
    min: 1,
    pattern: "^[A-Za-z0-9 ._-]+:.+$",
    required: true,
  })

  it("weighs the values against the pattern when the caller holds them", () => {
    const wrong = validateField(MODULE, providers, undefined, () => [
      "openai:sk-1",
      "sk-2",
    ])

    expect(wrong?.code).toBe("pattern")
  })

  it("judges only a count when that is all the caller knows", () => {
    expect(validateField(MODULE, providers, undefined, () => 2)).toBeNull()
    expect(validateField(MODULE, providers, undefined, () => 0)?.code).toBe(
      "required"
    )
  })
})

describe("the formats", () => {
  it("refuses an empty value for each", () => {
    for (const format of FIELD_FORMATS) {
      expect(matchesFormat(format, "")).toBe(false)
    }
  })

  it("accepts a port within its bounds and refuses beyond", () => {
    expect(matchesFormat("port", "1")).toBe(true)
    expect(matchesFormat("port", "65535")).toBe(true)
    expect(matchesFormat("port", "65536")).toBe(false)
    expect(matchesFormat("port", "0")).toBe(false)
  })
})

describe("a whole selection", () => {
  const port = FieldSchema.parse({
    key: "port",
    kind: "number",
    label: "Port",
    max: 65_535,
    min: 1024,
    required: true,
  })

  it("says nothing about a module that is not chosen", () => {
    const problems = validateConfig(
      [manifest({ fields: [port] })],
      [],
      {},
      () => 0
    )

    expect(problems).toEqual([])
  })

  it("names the module and the field of a problem", () => {
    const problems = validateConfig(
      [manifest({ fields: [port] })],
      [MODULE],
      { [MODULE]: { port: 80 } },
      () => 0
    )

    expect(problems).toEqual([
      { code: "min", expected: "1024–65535", field: "port", module: MODULE },
    ])
  })

  it("skips a managed field when the caller fills it in itself", () => {
    const managed = FieldSchema.parse({
      key: "tunnel_id",
      kind: "text",
      label: "Tunnel",
      managed: true,
      required: true,
    })

    const asked = validateConfig(
      [manifest({ connection: "cloudflare", fields: [managed] })],
      [MODULE],
      {},
      () => 0,
      { skipManaged: true }
    )

    expect(asked).toEqual([])
  })

  it("asks for the login before the module's fields", () => {
    const problems = validateConfig(
      [manifest({ connection: "cloudflare", fields: [port] })],
      [MODULE],
      {},
      () => 0,
      { connected: () => false }
    )

    expect(problems).toEqual([
      {
        code: "connection",
        expected: "cloudflare",
        field: "",
        module: MODULE,
      },
    ])
  })

  it("returns to the fields once the login is given", () => {
    const problems = validateConfig(
      [manifest({ connection: "cloudflare", fields: [port] })],
      [MODULE],
      {},
      () => 0,
      { connected: () => true }
    )

    expect(problems.map((one) => one.code)).toEqual(["required"])
  })

  it("weighs neither the fields nor the count of a module postponed", () => {
    const problems = validateConfig(
      [manifest({ connection: "cloudflare", fields: [port] })],
      [MODULE],
      {},
      () => 0,
      { connected: () => false, deferred: [MODULE] }
    )

    expect(problems).toEqual([])
  })
})

describe("the value a module will read", () => {
  const version = FieldSchema.parse({
    default: "22",
    key: "node_version",
    kind: "version",
    label: "Node",
    options: ["24", "22", "20"],
  })

  const port = FieldSchema.parse({
    default: 5432,
    key: "port",
    kind: "number",
    label: "Port",
    max: 65_535,
    min: 1024,
    required: true,
  })

  it("takes the manifest's default when nothing was sent", () => {
    const problems = validateConfig(
      [manifest({ fields: [version, port] })],
      [MODULE],
      {},
      () => 0
    )

    expect(problems).toEqual([])
  })

  it("judges the value sent when there is one", () => {
    const problems = validateConfig(
      [manifest({ fields: [port] })],
      [MODULE],
      { [MODULE]: { port: 80 } },
      () => 0
    )

    expect(problems.map((one) => one.code)).toEqual(["min"])
  })

  it("falls back to the default rather than a null value", () => {
    const problems = validateConfig(
      [manifest({ fields: [port] })],
      [MODULE],
      { [MODULE]: { port: null } },
      () => 0
    )

    expect(problems).toEqual([])
  })
})
