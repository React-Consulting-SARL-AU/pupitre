import { z } from "zod"
import { ArchitectureSchema } from "../catalog"
import { EntitlementSchema } from "./session"

export const MachineSchema = z.object({
  hostname: z.string(),
  os: z.string(),
  version: z.string(),
  arch: ArchitectureSchema,
  cores: z.int().positive(),
  uptime_s: z.int().nonnegative(),
  load: z.tuple([z.number(), z.number(), z.number()]),
  ram_total_mb: z.int().nonnegative(),
  ram_used_mb: z.int().nonnegative(),
  swap_mb: z.int().nonnegative(),
  disk_total_gb: z.number().nonnegative(),
  disk_free_gb: z.number().nonnegative(),
  agent_version: z.string(),
})

export type Machine = z.infer<typeof MachineSchema>

export const SERVICE_STATES = [
  "running",
  "stopped",
  "failed",
  "unknown",
] as const

export const ServiceStateSchema = z.enum(SERVICE_STATES)

export type ServiceState = z.infer<typeof ServiceStateSchema>

export const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: ServiceStateSchema,
  version: z.string().optional(),
  port: z.int().min(1).max(65_535).optional(),
  unit: z.string().optional(),
})

export type Service = z.infer<typeof ServiceSchema>

export const PROJECT_STATES = [
  "online",
  "starting",
  "failed",
  "stopped",
  "external",
  "service",
] as const

export const ProjectStateSchema = z.enum(PROJECT_STATES)

export type ProjectState = z.infer<typeof ProjectStateSchema>

export const PACKAGE_MANAGERS = [
  "bun",
  "pnpm",
  "npm",
  "gradle",
  "uv",
  "service",
  "none",
] as const

export const PackageManagerSchema = z.enum(PACKAGE_MANAGERS)

export type PackageManager = z.infer<typeof PackageManagerSchema>

export const ProjectNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/)

export const PortSchema = z.int().min(1).max(65_535)

export const ProjectRegistrationSchema = z.object({
  name: ProjectNameSchema,
  dir: z.string().min(1),
  repo: z.string().optional(),
  pkgmgr: PackageManagerSchema,
  host: z.string().min(1),
  port: PortSchema,
  subdomain: z.string().optional(),
  cmd: z.string().min(1),
  install: z.string().optional(),
})

export type ProjectRegistration = z.infer<typeof ProjectRegistrationSchema>

export const ProjectSchema = ProjectRegistrationSchema.extend({
  state: ProjectStateSchema,
  url: z.string().optional(),
  branch: z.string().optional(),
  pid: z.int().positive().optional(),
  ram_mb: z.int().nonnegative().optional(),
  uptime_s: z.int().nonnegative().optional(),
})

export type Project = z.infer<typeof ProjectSchema>

export const SESSION_KINDS = ["claude", "codex", "hermes", "shell"] as const

export const SessionKindSchema = z.enum(SESSION_KINDS)

export type SessionKind = z.infer<typeof SessionKindSchema>

export const SessionSchema = z.object({
  pid: z.int().positive(),
  seconds: z.int().nonnegative(),
  ram_mb: z.int().nonnegative(),
  kind: SessionKindSchema,
  project: z.string().optional(),
  command: z.string(),
})

export type Session = z.infer<typeof SessionSchema>

export const SnapshotResultSchema = z.object({
  machine: MachineSchema,
  services: z.array(ServiceSchema),
  projects: z.array(ProjectSchema),
  sessions: z.array(SessionSchema),
  entitlement: EntitlementSchema,
})

export type SnapshotResult = z.infer<typeof SnapshotResultSchema>

export const StatusResultSchema = z.object({
  services: z.array(ServiceSchema),
  projects: z.array(ProjectSchema),
})

export type StatusResult = z.infer<typeof StatusResultSchema>

export const ServiceStatusParamsSchema = z.strictObject({
  id: z.string().min(1),
})

export type ServiceStatusParams = z.infer<typeof ServiceStatusParamsSchema>

export const ServiceStatusResultSchema = ServiceSchema.extend({
  credentials: z.record(z.string(), z.string()).optional(),
})

export type ServiceStatusResult = z.infer<typeof ServiceStatusResultSchema>

export const SubCommandSchema = z.object({
  name: z.string(),
  help: z.string(),
  args: z.array(z.array(z.string())),
})

export type SubCommand = z.infer<typeof SubCommandSchema>

export const CompletionsResultSchema = z.object({
  command: z.string(),
  sub: z.array(SubCommandSchema),
})

export type CompletionsResult = z.infer<typeof CompletionsResultSchema>
