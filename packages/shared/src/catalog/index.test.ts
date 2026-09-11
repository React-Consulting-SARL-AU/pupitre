import { describe, expect, it } from "bun:test"
import {
  ARCHITECTURES,
  FieldSchema,
  getPreset,
  ManifestSchema,
  MODULE_CATEGORIES,
  MODULE_IDS,
  ModuleIdSchema,
  PRESETS,
  PresetSchema,
} from "./index"

const secretField = {
  key: "app_password",
  kind: "secret",
  label: "Application password",
  required: true,
  generate: true,
}

const booleanField = {
  key: "always_on",
  kind: "boolean",
  label: "Always on",
  help: "Run as a systemd service",
  required: false,
  default: false,
}

const listField = {
  key: "providers",
  kind: "list",
  label: "Model providers",
  required: true,
  items: "secret",
  min: 1,
  max: 8,
}

const manifest = {
  id: "db.postgres",
  category: "database",
  name: "PostgreSQL 17",
  summary: "Local PostgreSQL with application and remote roles.",
  requires: ["core.system"],
  conflicts: [],
  resources: { ram_mb: 512, disk_mb: 800 },
  arch: ["amd64", "arm64"],
  fields: [secretField, { ...secretField, key: "remote_password" }],
  mandatory: false,
  since: "0.1.0",
}

describe("ManifestSchema", () => {
  it("accepts a module manifest", () => {
    expect(ManifestSchema.safeParse(manifest).success).toBe(true)
  })

  it("accepts a manifest with a boolean field and a list of secrets", () => {
    expect(
      ManifestSchema.safeParse({
        ...manifest,
        id: "ai.hermes",
        category: "ai",
        fields: [listField, booleanField],
      }).success
    ).toBe(true)
  })

  it("takes a module that says nothing about running as one that runs", () => {
    expect(ManifestSchema.parse(manifest).runs).toBe(true)
    expect(ManifestSchema.parse({ ...manifest, runs: false }).runs).toBe(false)
  })

  it("rejects an unknown category, a bad id and a missing resource", () => {
    expect(
      ManifestSchema.safeParse({ ...manifest, category: "storage" }).success
    ).toBe(false)
    expect(
      ManifestSchema.safeParse({ ...manifest, id: "Postgres" }).success
    ).toBe(false)
    expect(
      ManifestSchema.safeParse({ ...manifest, resources: { ram_mb: 512 } })
        .success
    ).toBe(false)
  })
})

describe("FieldSchema", () => {
  it("accepts text, number, select, secret and version fields", () => {
    expect(
      FieldSchema.safeParse({
        key: "timezone",
        kind: "text",
        label: "Timezone",
        help: "IANA name",
        required: true,
        default: "Europe/Paris",
      }).success
    ).toBe(true)
    expect(
      FieldSchema.safeParse({
        key: "buffer_pool",
        kind: "number",
        label: "Buffer pool (MB)",
        required: false,
      }).success
    ).toBe(true)
    expect(
      FieldSchema.safeParse({
        key: "engine",
        kind: "select",
        label: "Engine",
        required: true,
        options: ["mysql", "mariadb"],
        default: "mysql",
      }).success
    ).toBe(true)
    expect(FieldSchema.safeParse(secretField).success).toBe(true)
    expect(
      FieldSchema.safeParse({
        key: "node_version",
        kind: "version",
        label: "Node",
        options: ["22", "24"],
        default: "24",
      }).success
    ).toBe(true)
  })

  it("bounds a number field, so a port cannot be typed out of range", () => {
    expect(
      FieldSchema.safeParse({
        key: "port",
        kind: "number",
        label: "Port",
        required: true,
        default: 5432,
        min: 1024,
        max: 65_535,
      }).success
    ).toBe(true)
    expect(
      FieldSchema.safeParse({
        key: "port",
        kind: "number",
        label: "Port",
        required: true,
        min: "1024",
      }).success
    ).toBe(false)
  })

  it("accepts boolean and list fields", () => {
    expect(FieldSchema.safeParse(booleanField).success).toBe(true)
    expect(FieldSchema.safeParse(listField).success).toBe(true)
    expect(
      FieldSchema.safeParse({
        key: "extensions",
        kind: "list",
        label: "Extensions",
        required: false,
        items: "text",
      }).success
    ).toBe(true)
  })

  it("rejects a list without items and a boolean with a non-boolean default", () => {
    const { items: _items, ...listWithoutItems } = listField

    expect(FieldSchema.safeParse(listWithoutItems).success).toBe(false)
    expect(
      FieldSchema.safeParse({ ...listField, items: "number" }).success
    ).toBe(false)
    expect(
      FieldSchema.safeParse({ ...booleanField, default: "yes" }).success
    ).toBe(false)
    expect(
      FieldSchema.safeParse({ ...booleanField, required: true }).success
    ).toBe(false)
    expect(
      FieldSchema.safeParse({ key: "x", kind: "boolean", label: "X" }).success
    ).toBe(false)
  })

  it("rejects a secret with a default and a version without options", () => {
    expect(
      FieldSchema.safeParse({ ...secretField, default: "hunter2" }).success
    ).toBe(false)
    expect(
      FieldSchema.safeParse({
        key: "node_version",
        kind: "version",
        label: "Node",
        default: "24",
      }).success
    ).toBe(false)
    expect(
      FieldSchema.safeParse({ key: "x", kind: "toggle", label: "X" }).success
    ).toBe(false)
  })
})

describe("module ids", () => {
  it("list the whole catalogue, once each", () => {
    expect(MODULE_IDS).toEqual([
      "core.system",
      "core.hardening",
      "runtime.node",
      "runtime.java",
      "runtime.python",
      "runtime.go",
      "runtime.php",
      "runtime.ruby",
      "runtime.docker",
      "db.mysql",
      "db.postgres",
      "db.mongodb",
      "db.redis",
      "ai.claude",
      "ai.codex",
      "ai.hermes",
      "ai.browser",
      "editor.jetbrains",
      "editor.vscode",
      "editor.zed",
      "exposure.cloudflare",
      "exposure.caddy",
      "tool.github",
      "tool.1password",
      "tool.neon",
    ])
    expect(new Set(MODULE_IDS).size).toBe(MODULE_IDS.length)
  })

  it("validate through ModuleIdSchema", () => {
    expect(ModuleIdSchema.safeParse("tool.neon").success).toBe(true)
    expect(ModuleIdSchema.safeParse("tool.vercel").success).toBe(false)
  })

  it("expose the categories and architectures of the contract", () => {
    expect(MODULE_CATEGORIES).toEqual([
      "core",
      "runtime",
      "database",
      "ai",
      "editor",
      "exposure",
      "tool",
    ])
    expect(ARCHITECTURES).toEqual(["amd64", "arm64"])
  })
})

describe("presets", () => {
  it("match the contract lists", () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([
      "web-js",
      "full",
      "minimal",
    ])
    expect(getPreset("web-js").modules).toEqual([
      "core.system",
      "core.hardening",
      "runtime.node",
      "db.mysql",
      "ai.claude",
      "ai.browser",
      "editor.vscode",
    ])
    expect(getPreset("full").modules).toEqual(
      MODULE_IDS.filter((id) => !id.startsWith("exposure."))
    )
    expect(getPreset("full").choose_one).toEqual([
      "exposure.caddy",
      "exposure.cloudflare",
    ])
    expect(getPreset("minimal").modules).toEqual([
      "core.system",
      "core.hardening",
    ])
    expect(getPreset("minimal").choose_one).toEqual([
      "ai.claude",
      "ai.codex",
      "ai.hermes",
    ])
  })

  it("carry their own name, so the app translates nothing", () => {
    expect(PRESETS.map((preset) => preset.name)).toEqual([
      "Web JavaScript",
      "Tout le catalogue",
      "Minimal",
    ])
    expect(
      PresetSchema.safeParse({ id: "full", name: "", modules: [] }).success
    ).toBe(false)
  })

  it("validate through PresetSchema", () => {
    for (const preset of PRESETS) {
      expect(PresetSchema.safeParse(preset).success).toBe(true)
    }
    expect(
      PresetSchema.safeParse({
        id: "web-js",
        name: "Web JavaScript",
        modules: ["runtime.elixir"],
      }).success
    ).toBe(true)
    expect(
      PresetSchema.safeParse({
        id: "web-js",
        name: "Web JavaScript",
        modules: ["Runtime Elixir"],
      }).success
    ).toBe(false)
    expect(
      PresetSchema.safeParse({ id: "custom", name: "Sur mesure", modules: [] })
        .success
    ).toBe(false)
  })
})

describe("PRESETS", () => {
  it("never puts two conflicting exposure modules in the same preset", () => {
    for (const preset of PRESETS) {
      const exposures = preset.modules.filter((id) =>
        id.startsWith("exposure.")
      )

      expect(exposures.length).toBeLessThanOrEqual(1)
    }
  })
})
