import { z } from "zod"
import { ManifestSchema, PresetSchema } from "../catalog"
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

export const InstallParamsSchema = z.strictObject({
  modules: z.array(z.string().min(1)).min(1),
  config: ModuleConfigSchema,
  secrets_stdin: z.boolean(),
})

export type InstallParams = z.infer<typeof InstallParamsSchema>

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

export const HardenResultSchema = z.object({
  root_closed: z.boolean(),
  next_user: z.string(),
  reason: z.string().optional(),
})

export type HardenResult = z.infer<typeof HardenResultSchema>

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
