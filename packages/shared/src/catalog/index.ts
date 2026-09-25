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

const CATEGORY_OF_PREFIX: Record<string, ModuleCategory> = { db: "database" }

export function categoryOfModule(moduleId: string): string {
  const prefix = moduleId.split(".")[0] ?? ""

  return CATEGORY_OF_PREFIX[prefix] ?? prefix
}

export const ARCHITECTURES = ["amd64", "arm64"] as const

export const ArchitectureSchema = z.enum(ARCHITECTURES)

export type Architecture = z.infer<typeof ArchitectureSchema>

// Mise tool names: each is the module `runtime.<tool>`, whose versions field is `<tool>_versions`.
export const RUNTIME_TOOLS = [
  "node",
  "java",
  "python",
  "go",
  "php",
  "ruby",
  "rust",
] as const

export const RuntimeToolSchema = z.enum(RUNTIME_TOOLS)

export type RuntimeTool = z.infer<typeof RuntimeToolSchema>

export function runtimeModuleId(tool: RuntimeTool): string {
  return `runtime.${tool}`
}

export const MODULE_IDS = [
  "core.system",
  "core.hardening",
  "core.backup",
  "runtime.node",
  "runtime.java",
  "runtime.python",
  "runtime.go",
  "runtime.php",
  "runtime.ruby",
  "runtime.docker",
  "runtime.rust",
  "db.mysql",
  "db.postgres",
  "db.mongodb",
  "db.redis",
  "db.mailpit",
  "ai.claude",
  "ai.codex",
  "ai.cursor",
  "ai.gemini",
  "ai.copilot",
  "ai.opencode",
  "ai.hermes",
  "ai.openclaw",
  "ai.browser",
  "editor.jetbrains",
  "editor.vscode",
  "editor.zed",
  "exposure.cloudflare",
  "exposure.caddy",
  "exposure.tailscale",
  "tool.github",
  "tool.1password",
  "tool.neon",
  "tool.wrangler",
  "tool.vercel",
  "tool.supabase",
  "tool.stripe",
] as const

export const ModuleIdSchema = z.enum(MODULE_IDS)

export type ModuleId = z.infer<typeof ModuleIdSchema>

export const MANDATORY_MODULE_IDS = [
  "core.system",
  "core.hardening",
] as const satisfies readonly ModuleId[]

const ModuleIdPatternSchema = z.string().regex(/^[a-z]+\.[a-z0-9-]+$/)

// The expressions behind these names live in `formats.ts`, which both sides read.
export const FIELD_FORMATS = [
  "port",
  "hostname",
  "domain",
  "email",
  "identifier",
  "path",
  "timezone",
  "size",
  "url",
] as const

const FieldFormatSchema = z.enum(FIELD_FORMATS)

export type FieldFormat = z.infer<typeof FieldFormatSchema>

// Behind a bubble, so nothing the reader needs to fill the field belongs here.
const FieldHintSchema = z.object({
  text: z.string().min(1),
  url: z.url().optional(),
})

export type FieldHint = z.infer<typeof FieldHintSchema>

const FieldBaseSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  help: z.string().optional(),
  hint: FieldHintSchema.optional(),
  format: FieldFormatSchema.optional(),
  pattern: z.string().optional(),
  min_length: z.int().nonnegative().optional(),
  max_length: z.int().nonnegative().optional(),
  // Filled by the app from the module's connection, never typed nor displayed.
  managed: z.boolean().optional(),
})

const INPUT_FIELD_KINDS = ["text", "number", "select"] as const

const InputFieldSchema = FieldBaseSchema.extend({
  kind: z.enum(INPUT_FIELD_KINDS),
  required: z.boolean(),
  default: z.unknown().optional(),
  options: z.array(z.string()).optional(),
  min: z.int().optional(),
  max: z.int().optional(),
}).strict()

const SecretFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("secret"),
  required: z.boolean(),
  generate: z.boolean().optional(),
}).strict()

const VersionFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("version"),
  options: z.array(z.string()).min(1),
  default: z.string(),
}).strict()

export const VersionsFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("versions"),
  // Newest first: the newest chosen is the machine's default.
  options: z.array(z.string()).min(1),
  default: z.array(z.string()).min(1),
})
  .strict()
  .refine(
    (field) =>
      field.default.every((version) => field.options.includes(version)),
    "a default version is one of the options"
  )

export type VersionsField = z.infer<typeof VersionsFieldSchema>

export function defaultVersionOf(
  field: VersionsField,
  chosen: readonly string[]
): string | undefined {
  return field.options.find((option) => chosen.includes(option))
}

const BooleanFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("boolean"),
  required: z.literal(false),
  default: z.boolean(),
}).strict()

const LIST_ITEM_KINDS = ["text", "secret"] as const

const ListFieldSchema = FieldBaseSchema.extend({
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
  VersionsFieldSchema,
  BooleanFieldSchema,
  ListFieldSchema,
])

export type Field = z.infer<typeof FieldSchema>

const ResourcesSchema = z.object({
  ram_mb: z.int().nonnegative(),
  disk_mb: z.int().nonnegative(),
})

export type Resources = z.infer<typeof ResourcesSchema>

// The `cloudflare` token never leaves the laptop, so the domain's rights stay off the server.
export const CONNECTION_KINDS = [
  "cloudflare",
  "wrangler",
  "github",
  "1password",
  "neon",
  "vercel",
  "supabase",
  "stripe",
  "backup",
] as const

export const ConnectionKindSchema = z.enum(CONNECTION_KINDS)

export type ConnectionKind = z.infer<typeof ConnectionKindSchema>

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
  connection: ConnectionKindSchema.optional(),
  // Defaults to true because an agent older than the field says nothing.
  runs: z.boolean().default(true),
  mandatory: z.boolean(),
  since: z.string().min(1),
})

export type Manifest = z.infer<typeof ManifestSchema>

const PRESET_IDS = ["web-js", "full", "minimal"] as const

const PresetIdSchema = z.enum(PRESET_IDS)

export const PresetSchema = z.object({
  id: PresetIdSchema,
  name: z.string().min(1),
  // A pattern, not the enum: a module the agent gained first can enter a preset without a release here.
  modules: z.array(ModuleIdPatternSchema),
  choose_one: z.array(ModuleIdPatternSchema).min(2).optional(),
})

export type Preset = z.infer<typeof PresetSchema>

const EXCLUSIVE_EXPOSURES: readonly ModuleId[] = [
  "exposure.caddy",
  "exposure.cloudflare",
]

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
    ],
  },
  {
    // Caddy and the tunnel contradict each other; Tailscale is private and lives beside either.
    id: "full",
    name: "Tout le catalogue",
    modules: MODULE_IDS.filter((id) => !EXCLUSIVE_EXPOSURES.includes(id)),
    choose_one: [...EXCLUSIVE_EXPOSURES],
  },
  {
    id: "minimal",
    name: "Minimal",
    modules: [...MANDATORY_MODULE_IDS],
    choose_one: [
      "ai.claude",
      "ai.codex",
      "ai.cursor",
      "ai.gemini",
      "ai.copilot",
      "ai.opencode",
      "ai.hermes",
    ],
  },
]
