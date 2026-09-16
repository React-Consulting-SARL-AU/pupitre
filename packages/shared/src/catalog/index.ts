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

/**
 * The runtimes mise holds at several versions at once, by their mise tool
 * name. Each is the module `runtime.<tool>`, and its versions field is
 * `<tool>_versions`; a project pins one of them under the same name.
 */
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

export function runtimeVersionsKey(tool: RuntimeTool): string {
  return `${tool}_versions`
}

export const MODULE_IDS = [
  "core.system",
  "core.hardening",
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

/**
 * The shapes a manifest can hold a value to.
 *
 * The names live here, with the field that carries them; the expressions that
 * decide live in `formats.ts`, which is where both sides read them from.
 */
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

export const FieldFormatSchema = z.enum(FIELD_FORMATS)

export type FieldFormat = z.infer<typeof FieldFormatSchema>

/**
 * The long form of `help`, behind a bubble.
 *
 * It says where a value is found and, when there is one, links the page that
 * issues it. Nothing the reader needs in order to fill the field belongs here:
 * a bubble is opened, and what decides is read without a gesture.
 */
export const FieldHintSchema = z.object({
  text: z.string().min(1),
  url: z.url().optional(),
})

export type FieldHint = z.infer<typeof FieldHintSchema>

/**
 * A managed field is derived from a connection by the app, never typed: it is
 * filled on the way out and never displayed. Only a module that declares a
 * `connection` may carry one.
 */
const FieldBaseSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  help: z.string().optional(),
  hint: FieldHintSchema.optional(),
  format: FieldFormatSchema.optional(),
  pattern: z.string().optional(),
  min_length: z.int().nonnegative().optional(),
  max_length: z.int().nonnegative().optional(),
  managed: z.boolean().optional(),
})

export const INPUT_FIELD_KINDS = ["text", "number", "select"] as const

export const InputFieldSchema = FieldBaseSchema.extend({
  kind: z.enum(INPUT_FIELD_KINDS),
  required: z.boolean(),
  default: z.unknown().optional(),
  options: z.array(z.string()).optional(),
  min: z.int().optional(),
  max: z.int().optional(),
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

/**
 * Several versions side by side, for a runtime mise can hold at every major
 * at once. `options` runs newest first, and the newest of the chosen ones is
 * the machine's default: what a shell outside any project runs, and what a
 * project that names none gets.
 */
export const VersionsFieldSchema = FieldBaseSchema.extend({
  kind: z.literal("versions"),
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

/** The version a runtime runs at when nothing names one: the newest chosen, in the order the options run. */
export function defaultVersionOf(
  field: VersionsField,
  chosen: readonly string[]
): string | undefined {
  return field.options.find((option) => chosen.includes(option))
}

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
  VersionsFieldSchema,
  BooleanFieldSchema,
  ListFieldSchema,
])

export type Field = z.infer<typeof FieldSchema>

export const ResourcesSchema = z.object({
  ram_mb: z.int().nonnegative(),
  disk_mb: z.int().nonnegative(),
})

export type Resources = z.infer<typeof ResourcesSchema>

/**
 * The third-party accounts the app holds for the client, once for every server.
 *
 * A token that is the same on every machine belongs to the account, not to a
 * server: the app keeps it in the system keychain and fills the module's
 * managed field with it at install time.
 *
 * `cloudflare` and `wrangler` open the same account with two tokens: the first
 * makes tunnels and DNS records from the laptop and never leaves it, the second
 * is exported into the server's shell for Wrangler. One token for both would
 * put the rights over the client's domain where their agents run.
 */
export const CONNECTION_KINDS = [
  "cloudflare",
  "wrangler",
  "github",
  "1password",
  "neon",
  "vercel",
  "supabase",
  "stripe",
] as const

export const ConnectionKindSchema = z.enum(CONNECTION_KINDS)

export type ConnectionKind = z.infer<typeof ConnectionKindSchema>

/**
 * `runs` says whether the module holds a process on the machine, or spawns one
 * at any moment: a database, a tunnel, an editor server, a coding agent.
 *
 * A language, a CLI or a hardening pass leaves nothing to watch, and the
 * dashboard has no row to give it. An agent older than the field says nothing,
 * and everything it installed is taken to run, which is what the dashboard did
 * before the field existed.
 */
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
  runs: z.boolean().default(true),
  mandatory: z.boolean(),
  since: z.string().min(1),
})

export type Manifest = z.infer<typeof ManifestSchema>

export const PRESET_IDS = ["web-js", "full", "minimal"] as const

export const PresetIdSchema = z.enum(PRESET_IDS)

export type PresetId = z.infer<typeof PresetIdSchema>

/**
 * A preset names modules the way a manifest does: a module the agent gained
 * before this package knew of it can enter one without a release here.
 */
export const PresetSchema = z.object({
  id: PresetIdSchema,
  name: z.string().min(1),
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
    // Caddy and the tunnel contradict each other, so the preset carries
    // neither and asks which one instead. Ticking none of them is a state of
    // its own: the machine answers through the app's own session. Tailscale
    // is an exposure too, but a private one that lives beside either.
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

export function getPreset(id: PresetId): Preset {
  const preset = PRESETS.find((candidate) => candidate.id === id)

  if (!preset) {
    throw new Error(`Unknown preset: ${id}`)
  }

  return preset
}
