import { z } from "zod"

export const MODULE_CATEGORIES = [
  "core",
  "runtime",
  "database",
  "ai",
  "editor",
  "exposure",
  "tool",
] as const

export const ModuleCategorySchema = z.enum(MODULE_CATEGORIES)

export type ModuleCategory = z.infer<typeof ModuleCategorySchema>

export const ARCHITECTURES = ["amd64", "arm64"] as const

export const ArchitectureSchema = z.enum(ARCHITECTURES)

export type Architecture = z.infer<typeof ArchitectureSchema>

export const MVP_MODULE_IDS = [
  "core.system",
  "core.hardening",
  "runtime.node",
  "runtime.java",
  "runtime.python",
  "db.mysql",
  "db.postgres",
  "db.mongodb",
  "ai.claude",
  "ai.codex",
  "ai.hermes",
  "ai.browser",
  "editor.jetbrains",
  "editor.vscode",
  "editor.zed",
  "exposure.cloudflare",
  "exposure.ssh",
  "tool.github",
  "tool.1password",
] as const

export const LATER_MODULE_IDS = [
  "runtime.go",
  "runtime.php",
  "runtime.ruby",
  "runtime.docker",
  "db.redis",
  "exposure.caddy",
  "tool.neon",
] as const

export const MODULE_IDS = [...MVP_MODULE_IDS, ...LATER_MODULE_IDS] as const

export const ModuleIdSchema = z.enum(MODULE_IDS)

export type ModuleId = z.infer<typeof ModuleIdSchema>

export const MANDATORY_MODULE_IDS = [
  "core.system",
  "core.hardening",
] as const satisfies readonly ModuleId[]

const ModuleIdPatternSchema = z.string().regex(/^[a-z]+\.[a-z0-9-]+$/)

const FieldBaseSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  help: z.string().optional(),
})

export const INPUT_FIELD_KINDS = ["text", "number", "select"] as const

export const InputFieldSchema = FieldBaseSchema.extend({
  kind: z.enum(INPUT_FIELD_KINDS),
  required: z.boolean(),
  default: z.unknown().optional(),
  options: z.array(z.string()).optional(),
}).strict()

export type InputField = z.infer<typeof InputFieldSchema>

export const SecretFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("secret"),
  required: z.boolean(),
  generate: z.boolean().optional(),
}).strict()

export type SecretField = z.infer<typeof SecretFieldSchema>

export const VersionFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("version"),
  options: z.array(z.string()).min(1),
  default: z.string(),
}).strict()

export type VersionField = z.infer<typeof VersionFieldSchema>

export const BooleanFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("boolean"),
  required: z.literal(false),
  default: z.boolean(),
}).strict()

export type BooleanField = z.infer<typeof BooleanFieldSchema>

export const LIST_ITEM_KINDS = ["text", "secret"] as const

export const ListFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("list"),
  required: z.boolean(),
  items: z.enum(LIST_ITEM_KINDS),
  min: z.int().nonnegative().optional(),
  max: z.int().nonnegative().optional(),
}).strict()

export type ListField = z.infer<typeof ListFieldSchema>

export const FieldSchema = z.discriminatedUnion("kind", [
  InputFieldSchema,
  SecretFieldSchema,
  VersionFieldSchema,
  BooleanFieldSchema,
  ListFieldSchema,
])

export type Field = z.infer<typeof FieldSchema>

export const ResourcesSchema = z.object({
  ram_mb: z.int().nonnegative(),
  disk_mb: z.int().nonnegative(),
})

export type Resources = z.infer<typeof ResourcesSchema>

export const ManifestSchema = z.object({
  id: ModuleIdPatternSchema,
  category: ModuleCategorySchema,
  name: z.string().min(1),
  summary: z.string().min(1),
  requires: z.array(ModuleIdPatternSchema),
  conflicts: z.array(ModuleIdPatternSchema),
  resources: ResourcesSchema,
  arch: z.array(ArchitectureSchema).min(1),
  fields: z.array(FieldSchema),
  provides: z.array(z.string()),
  mandatory: z.boolean(),
  since: z.string().min(1),
})

export type Manifest = z.infer<typeof ManifestSchema>

export const PRESET_IDS = ["web-js", "full", "minimal"] as const

export const PresetIdSchema = z.enum(PRESET_IDS)

export type PresetId = z.infer<typeof PresetIdSchema>

export const PresetSchema = z.object({
  id: PresetIdSchema,
  name: z.string().min(1),
  modules: z.array(ModuleIdSchema),
  choose_one: z.array(ModuleIdSchema).min(2).optional(),
})

export type Preset = z.infer<typeof PresetSchema>

export const PRESETS: readonly Preset[] = [
  {
    id: "web-js",
    name: "Web JavaScript",
    modules: [
      "core.system",
      "core.hardening",
      "runtime.node",
      "db.mysql",
      "ai.claude",
      "ai.browser",
      "editor.vscode",
      "exposure.ssh",
    ],
  },
  {
    // Everything but exposure.ssh: the two exposure modules conflict, and a
    // preset that cannot be resolved is worse than one that picks a side.
    id: "full",
    name: "Tout le catalogue",
    modules: MVP_MODULE_IDS.filter((id) => id !== "exposure.ssh"),
  },
  {
    id: "minimal",
    name: "Minimal",
    modules: [...MANDATORY_MODULE_IDS],
    choose_one: ["ai.claude", "ai.codex", "ai.hermes"],
  },
]

export function getPreset(id: PresetId): Preset {
  const preset = PRESETS.find((candidate) => candidate.id === id)

  if (!preset) {
    throw new Error(`Unknown preset: ${id}`)
  }

  return preset
}
