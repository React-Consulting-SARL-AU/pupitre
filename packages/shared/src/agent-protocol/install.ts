import { z } from "zod"
import { ManifestSchema, PresetSchema } from "../catalog"
import { FieldProblemSchema } from "../catalog/validate"
import { StepStatusSchema } from "./envelope"

export const ProbePortSchema = z.object({
  port: z.int().min(1).max(65_535),
  process: z.string().optional(),
})

export type ProbePort = z.infer<typeof ProbePortSchema>

export const PROBE_VERDICT_LEVELS = ["ready", "warning", "blocked"] as const

export const ProbeVerdictLevelSchema = z.enum(PROBE_VERDICT_LEVELS)

export const PROBE_VERDICT_KINDS = [
  "bare",
  "managed",
  "occupied",
  "incompatible",
] as const

export const ProbeVerdictKindSchema = z.enum(PROBE_VERDICT_KINDS)

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

export const ModuleConfigSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown())
)

export type ModuleConfig = z.infer<typeof ModuleConfigSchema>

export const ModuleConfigParamsSchema = z.strictObject({
  id: z.string().min(1),
})

export type ModuleConfigParams = z.infer<typeof ModuleConfigParamsSchema>

/**
 * What the agent retained from the last request for this module.
 *
 * `values` carries the plain configuration, the kind that already travels in
 * `params`. `secrets` only carries the names of the secret fields it holds:
 * a secret value never comes back through here, it only leaves the server
 * via `service.secret`, one at a time, on request.
 */
export const ModuleConfigResultSchema = z.object({
  id: z.string(),
  values: z.record(z.string(), z.unknown()),
  secrets: z.array(z.string()),
})

export type ModuleConfigResult = z.infer<typeof ModuleConfigResultSchema>

/**
 * `defer` names the modules to put on the machine without configuring them.
 *
 * It is optional, and the app leaves it out when it names nobody: an agent
 * older than the field refuses a request that carries it, its parameters being
 * a closed shape, so an ordinary install goes on working against the agent
 * already on the machine.
 *
 * A service whose settings are not ready yet — a token nobody has minted, an
 * account nobody has connected — no longer holds the whole installation back.
 * The agent runs its install step and stops there: nothing of it is configured,
 * nothing of it is started by us, and its own fields are not validated, since
 * there is nothing to validate. It reports itself installed and not configured,
 * and the configuration finishes it later.
 */
export const InstallParamsSchema = z.strictObject({
  modules: z.array(z.string().min(1)).min(1),
  config: ModuleConfigSchema,
  defer: z.array(z.string().min(1)).optional(),
  secrets_stdin: z.boolean(),
})

export type InstallParams = z.infer<typeof InstallParamsSchema>

/**
 * The same request as `install`, weighed and not run.
 *
 * It carries no secret and touches nothing: it answers with what the fields get
 * wrong and with what only the machine knows — a port already listening, a
 * directory that is a file. The app asks it before leaving the configuration.
 */
export const InstallCheckParamsSchema = z.strictObject({
  modules: z.array(z.string().min(1)).min(1),
  config: ModuleConfigSchema,
  defer: z.array(z.string().min(1)).optional(),
})

export type InstallCheckParams = z.infer<typeof InstallCheckParamsSchema>

export const InstallCheckResultSchema = z.object({
  problems: z.array(FieldProblemSchema),
  warnings: z.array(z.string()),
})

export type InstallCheckResult = z.infer<typeof InstallCheckResultSchema>

/** A `list` field of `items: "secret"` travels under indexed keys: `providers.0`, `providers.1`. */
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

export type UninstallParams = z.infer<typeof UninstallParamsSchema>

export const UninstallResultSchema = z.object({
  failed: z.array(z.string()),
})

export type UninstallResult = z.infer<typeof UninstallResultSchema>

export const HardenParamsSchema = z.strictObject({
  user: z.literal("dev"),
})

export type HardenParams = z.infer<typeof HardenParamsSchema>

/**
 * `root_kept` says root is still reachable because the configuration asked for
 * it, never because the hardening gave up: a refusal is `root_closed: false`
 * with a `reason`, and the two flags are never true together.
 */
export const HardenResultSchema = z.object({
  root_closed: z.boolean(),
  root_kept: z.boolean(),
  next_user: z.string(),
  reason: z.string().optional(),
})

export type HardenResult = z.infer<typeof HardenResultSchema>

/** A `crypt(3)` hash, yescrypt (`$y$`) or SHA-512 (`$6$`): never the password itself. */
export const SUDO_PASSWORD_HASH_PATTERN =
  "^\\$(y\\$[./0-9A-Za-z]+\\$[./0-9A-Za-z]{1,86}\\$[./0-9A-Za-z]{43}|6\\$(rounds=[1-9][0-9]{3,8}\\$)?[./0-9A-Za-z]{1,16}\\$[./0-9A-Za-z]{86})$"

export const HardenSudoParamsSchema = z.strictObject({
  user: z.literal("dev"),
  secrets_stdin: z.literal(true),
})

export type HardenSudoParams = z.infer<typeof HardenSudoParamsSchema>

export const HardenSudoSecretsSchema = z.strictObject({
  password_hash: z.string().regex(new RegExp(SUDO_PASSWORD_HASH_PATTERN)),
})

export type HardenSudoSecrets = z.infer<typeof HardenSudoSecretsSchema>

export const HardenSudoResultSchema = z.object({
  sudo: z.literal("password"),
})

export type HardenSudoResult = z.infer<typeof HardenSudoResultSchema>

export const UpgradeParamsSchema = z.strictObject({
  modules: z.array(z.string().min(1)).optional(),
})

export type UpgradeParams = z.infer<typeof UpgradeParamsSchema>

export const ReportStepSchema = z.object({
  step: z.string(),
  status: StepStatusSchema,
  ms: z.int().nonnegative(),
  replay: z.string().optional(),
  message: z.string().optional(),
})

export type ReportStep = z.infer<typeof ReportStepSchema>

export const MODULE_REPORT_STATUSES = ["ok", "skip", "warn", "fail"] as const

export const ModuleReportStatusSchema = z.enum(MODULE_REPORT_STATUSES)

export const ModuleReportSchema = z.object({
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
