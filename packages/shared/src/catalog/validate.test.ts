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
    provides: [],
    requires: [],
    resources: { disk_mb: 0, ram_mb: 0 },
    since: "0.1.0",
    summary: "A module for the tests",
    ...over,
  }
}

describe("les cas partagés avec l'agent", () => {
  it("déclare un champ valide pour chaque cas", () => {
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

describe("les formats", () => {
  it("refuse une valeur vide pour chacun", () => {
    for (const format of FIELD_FORMATS) {
      expect(matchesFormat(format, "")).toBe(false)
    }
  })

  it("accepte un port dans ses bornes et refuse au-delà", () => {
    expect(matchesFormat("port", "1")).toBe(true)
    expect(matchesFormat("port", "65535")).toBe(true)
    expect(matchesFormat("port", "65536")).toBe(false)
    expect(matchesFormat("port", "0")).toBe(false)
  })
})

describe("une sélection entière", () => {
  const port = FieldSchema.parse({
    key: "port",
    kind: "number",
    label: "Port",
    max: 65_535,
    min: 1024,
    required: true,
  })

  it("ne dit rien d'un module qui n'est pas choisi", () => {
    const problems = validateConfig(
      [manifest({ fields: [port] })],
      [],
      {},
      () => 0
    )

    expect(problems).toEqual([])
  })

  it("nomme le module et le champ d'un problème", () => {
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

  it("saute un champ géré quand l'appelant le remplit lui-même", () => {
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

  it("réclame la connexion avant les champs du module", () => {
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

  it("revient aux champs une fois la connexion donnée", () => {
    const problems = validateConfig(
      [manifest({ connection: "cloudflare", fields: [port] })],
      [MODULE],
      {},
      () => 0,
      { connected: () => true }
    )

    expect(problems.map((one) => one.code)).toEqual(["required"])
  })
})

describe("la valeur qu'un module lira", () => {
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

  it("prend le défaut du manifeste quand rien n'a été envoyé", () => {
    const problems = validateConfig(
      [manifest({ fields: [version, port] })],
      [MODULE],
      {},
      () => 0
    )

    expect(problems).toEqual([])
  })

  it("juge la valeur envoyée quand il y en a une", () => {
    const problems = validateConfig(
      [manifest({ fields: [port] })],
      [MODULE],
      { [MODULE]: { port: 80 } },
      () => 0
    )

    expect(problems.map((one) => one.code)).toEqual(["min"])
  })

  it("retombe sur le défaut plutôt que sur une valeur nulle", () => {
    const problems = validateConfig(
      [manifest({ fields: [port] })],
      [MODULE],
      { [MODULE]: { port: null } },
      () => 0
    )

    expect(problems).toEqual([])
  })
})
