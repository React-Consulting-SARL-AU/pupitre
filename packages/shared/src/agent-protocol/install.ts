import { z } from "zod"
import { ManifestSchema, PresetSchema } from "../catalog"
import { FieldProblemSchema } from "../catalog/validate"
import { StepStatusSchema } from "./envelope"

const ProbePortSchema = z.object({
  port: z.int().min(1).max(65_535),
  process: z.string().optional(),
})

const PROBE_VERDICT_LEVELS = ["ready", "warning", "blocked"] as const

const ProbeVerdictLevelSchema = z.enum(PROBE_VERDICT_LEVELS)

const PROBE_VERDICT_KINDS = [
  "bare",
  "managed",
  "occupied",
  "incompatible",
] as const

const ProbeVerdictKindSchema = z.enum(PROBE_VERDICT_KINDS)

export const ProbeVerdictSchema = z.object({
  level: ProbeVerdictLevelSchema,
  kind: ProbeVerdictKindSchema,
  up_to_date: z.boolean().optional(),
  reasons: z.array(z.string()),
  fixes: z.array(z.string()),
})

export type ProbeVerdict = z.infer<typeof ProbeVerdictSchema>

export const ProbeResultSchema = z.object({
  os: z.string(),
  version: z.string(),
  arch: z.string(),
  ram_mb: z.int().nonnegative(),
  disk_free_gb: z.number().nonnegative(),
  sudo: z.boolean(),
  ports: z.array(ProbePortSchema),
  docker: z.boolean(),
  panel: z.string().nullable(),
  agent_version: z.string().nullable(),
  installed_modules: z.array(z.string()),
  verdict: ProbeVerdictSchema,
})

export type ProbeResult = z.infer<typeof ProbeResultSchema>

export const CatalogResultSchema = z.object({
  modules: z.array(ManifestSchema),
  presets: z.array(PresetSchema),
})

export type CatalogResult = z.infer<typeof CatalogResultSchema>

const ModuleConfigSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown())
)

export type ModuleConfig = z.infer<typeof ModuleConfigSchema>

export const ModuleConfigParamsSchema = z.strictObject({
  id: z.string().min(1),
})

export const ModuleConfigResultSchema = z.object({
  id: z.string(),
  values: z.record(z.string(), z.unknown()),
  // Names only: a secret value leaves the server through `service.secret`, one at a time.
  secrets: z.array(z.string()),
})

export type ModuleConfigResult = z.infer<typeof ModuleConfigResultSchema>

export const InstallParamsSchema = z.strictObject({
  modules: z.array(z.string().min(1)).min(1),
  config: ModuleConfigSchema,
  // Left out when empty: an agent older than the field refuses it, its params being a closed shape.
  defer: z.array(z.string().min(1)).optional(),
  secrets_stdin: z.boolean(),
})

export const InstallCheckParamsSchema = z.strictObject({
  modules: z.array(z.string().min(1)).min(1),
  config: ModuleConfigSchema,
  defer: z.array(z.string().min(1)).optional(),
})

export const InstallCheckResultSchema = z.object({
  problems: z.array(FieldProblemSchema),
  warnings: z.array(z.string()),
})

export type InstallCheckResult = z.infer<typeof InstallCheckResultSchema>

// A `list` field of `items: "secret"` travels under indexed keys: `providers.0`, `providers.1`.
export const InstallSecretsSchema = z.record(
  z.string(),
  z.record(z.string(), z.string())
)

export type InstallSecrets = z.infer<typeof InstallSecretsSchema>

export const InstallResultSchema = z.object({
  failed: z.array(z.string()),
  warned: z.array(z.string()),
  report_path: z.string(),
})

export type InstallResult = z.infer<typeof InstallResultSchema>

export const UninstallParamsSchema = z.strictObject({
  modules: z.array(z.string().min(1)).min(1),
})

export const UninstallResultSchema = z.object({
  failed: z.array(z.string()),
})

export const HardenParamsSchema = z.strictObject({
  user: z.literal("dev"),
})

export const HardenResultSchema = z.object({
  root_closed: z.boolean(),
  // Only because the configuration asked: a refusal is `root_closed: false` with a `reason`.
  root_kept: z.boolean(),
  next_user: z.string(),
  reason: z.string().optional(),
})

export type HardenResult = z.infer<typeof HardenResultSchema>

// A `crypt(3)` hash, yescrypt (`$y$`) or SHA-512 (`$6$`): never the password itself.
export const SUDO_PASSWORD_HASH_PATTERN =
  "^\\$(y\\$[./0-9A-Za-z]+\\$[./0-9A-Za-z]{1,86}\\$[./0-9A-Za-z]{43}|6\\$(rounds=[1-9][0-9]{3,8}\\$)?[./0-9A-Za-z]{1,16}\\$[./0-9A-Za-z]{86})$"

export const HardenSudoParamsSchema = z.strictObject({
  user: z.literal("dev"),
  secrets_stdin: z.literal(true),
})

export const HardenSudoSecretsSchema = z.strictObject({
  password_hash: z.string().regex(new RegExp(SUDO_PASSWORD_HASH_PATTERN)),
})

export type HardenSudoSecrets = z.infer<typeof HardenSudoSecretsSchema>

export const HardenSudoResultSchema = z.object({
  sudo: z.literal("password"),
})

export const UpgradeParamsSchema = z.strictObject({
  modules: z.array(z.string().min(1)).optional(),
})

const ReportStepSchema = z.object({
  step: z.string(),
  status: StepStatusSchema,
  ms: z.int().nonnegative(),
  replay: z.string().optional(),
  message: z.string().optional(),
})

const MODULE_REPORT_STATUSES = ["ok", "skip", "warn", "fail"] as const

const ModuleReportStatusSchema = z.enum(MODULE_REPORT_STATUSES)

const ModuleReportSchema = z.object({
  id: z.string(),
  status: ModuleReportStatusSchema,
  steps: z.array(ReportStepSchema),
})

export type ModuleReport = z.infer<typeof ModuleReportSchema>

export const InstallReportSchema = z.object({
  started_at: z.string(),
  finished_at: z.string(),
  agent_version: z.string(),
  modules: z.array(ModuleReportSchema),
  failed: z.array(z.string()),
  warned: z.array(z.string()),
  report_path: z.string(),
})

export type InstallReport = z.infer<typeof InstallReportSchema>
