import { z } from "zod"
import {
  ArchitectureSchema,
  ConnectionKindSchema,
  RuntimeToolSchema,
} from "../catalog"
import { PortSchema } from "./ports"
import { EntitlementSchema } from "./session"

const SUDO_STATES = ["password", "nopasswd_all"] as const

const SudoStateSchema = z.enum(SUDO_STATES)

export type SudoState = z.infer<typeof SudoStateSchema>

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
  // Absent when the sudoers file is neither, or from an agent older than the field.
  sudo: SudoStateSchema.optional(),
})

export type Machine = z.infer<typeof MachineSchema>

const SERVICE_STATES = ["running", "stopped", "failed", "unknown"] as const

const ServiceStateSchema = z.enum(SERVICE_STATES)

export type ServiceState = z.infer<typeof ServiceStateSchema>

export const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: ServiceStateSchema,
  // False while the reader put off the module's questions: the screen offers the form that finishes it.
  configured: z.boolean().default(true),
  // Copied from the manifest so that a screen never has to read the catalogue.
  runs: z.boolean().default(true),
  connection: ConnectionKindSchema.optional(),
  version: z.string().optional(),
  // Newest first.
  versions: z.array(z.string()).optional(),
  port: z.int().min(1).max(65_535).optional(),
  unit: z.string().optional(),
  // Only the agent knows where a module laid what the laptop points at, e.g. the JetBrains Gateway backend.
  path: z.string().optional(),
})

export type Service = z.infer<typeof ServiceSchema>

const PROCESS_STATES = [
  "online",
  "starting",
  "failed",
  "stopped",
  "down",
  "external",
  "service",
] as const

export const ProcessStateSchema = z.enum(PROCESS_STATES)

export type ProcessState = z.infer<typeof ProcessStateSchema>

// `partial` is the one state a process never has by itself: only some of a project's processes run.
const PROJECT_STATES = [...PROCESS_STATES, "partial"] as const

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

const SUBDOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"

// One label is what a Cloudflare universal certificate covers; several are the client's own call.
export const SUBDOMAIN_PATTERN = new RegExp(
  `^${SUBDOMAIN_LABEL}(?:\\.${SUBDOMAIN_LABEL})*$`
)

// What is left of the 253 octets of a name once a zone is put after it.
export const SUBDOMAIN_MAX = 190

export const ProjectSubdomainSchema = z
  .string()
  .min(1)
  .max(SUBDOMAIN_MAX)
  .regex(SUBDOMAIN_PATTERN)

// Two labels at the least: a bare domain is not something a project answers to.
export const HOSTNAME_PATTERN = new RegExp(
  `^${SUBDOMAIN_LABEL}(?:\\.${SUBDOMAIN_LABEL})+$`
)

export const HOSTNAME_MAX = 253

export const HostnameSchema = z
  .string()
  .min(1)
  .max(HOSTNAME_MAX)
  .regex(HOSTNAME_PATTERN)

// One DNS label, because the app puts it in front of the subdomain: `api-shop.example.org`.
export const ROUTE_LABEL_MAX = 63

export const RouteLabelSchema = z
  .string()
  .min(1)
  .max(ROUTE_LABEL_MAX)
  .regex(new RegExp(`^${SUBDOMAIN_LABEL}$`))

export const RouteSchema = z.object({
  label: RouteLabelSchema,
  port: PortSchema,
  // Resolved once when declared: a name on the web does not move because the server's domain did.
  hostname: HostnameSchema.optional(),
})

export type Route = z.infer<typeof RouteSchema>

export const RouteRequestSchema = z.strictObject({
  label: RouteLabelSchema,
  port: PortSchema,
  subdomain: ProjectSubdomainSchema.optional(),
})

export type RouteRequest = z.infer<typeof RouteRequestSchema>

export const GitBranchSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)

export const LocalhostNameSchema = z
  .string()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+localhost$/)

// It names the tmux window and the log file, `<project>/<process>`, so no slash.
export const ProcessIdSchema = RouteLabelSchema

export const ProcessDirSchema = z
  .string()
  .min(1)
  .refine(
    (dir) => !(dir.startsWith("/") || dir.split("/").includes("..")),
    "a process runs inside its project"
  )

export const PROJECT_ROOT_DIR = "."

const ProcessBaseSchema = z.object({
  id: ProcessIdSchema,
  pkgmgr: PackageManagerSchema,
  host: z.string().min(1),
  // The one that decides the state, and the local address.
  port: PortSchema,
  cmd: z.string().min(1),
  install: z.string().optional(),
})

const ProcessRegistrationSchema = ProcessBaseSchema.extend({
  dir: ProcessDirSchema.default(PROJECT_ROOT_DIR),
  host: z.union([z.literal("127.0.0.1"), LocalhostNameSchema]),
  routes: z.array(RouteRequestSchema),
}).strict()

export type ProcessRegistration = z.infer<typeof ProcessRegistrationSchema>

const AbsolutePathSchema = z.string().regex(/^\//)

export const ProcessSchema = ProcessBaseSchema.extend({
  dir: ProcessDirSchema,
  path: AbsolutePathSchema,
  routes: z.array(RouteSchema),
  state: ProcessStateSchema,
  url: z.string().optional(),
  pid: z.int().positive().optional(),
  ram_mb: z.int().nonnegative().optional(),
  uptime_s: z.int().nonnegative().optional(),
})

export type Process = z.infer<typeof ProcessSchema>

export function uniqueProcessIds(
  processes: readonly { id: string }[]
): boolean {
  return (
    new Set(processes.map((process) => process.id)).size === processes.length
  )
}

const RuntimeVersionSchema = z.string().regex(/^[0-9]+(\.[0-9]+)*$/)

// A tool named by no entry runs at the machine's default.
export const ProjectRuntimesSchema = z.partialRecord(
  RuntimeToolSchema,
  RuntimeVersionSchema
)

export type ProjectRuntimes = z.infer<typeof ProjectRuntimesSchema>

const ProjectBaseSchema = z.object({
  name: ProjectNameSchema,
  dir: z.string().min(1),
  repo: z.string().optional(),
  branch: GitBranchSchema.optional(),
})

export const ProjectRegistrationSchema = ProjectBaseSchema.extend({
  processes: z
    .array(ProcessRegistrationSchema)
    .min(1)
    .refine(uniqueProcessIds, "two processes of a project cannot share an id"),
  // Starts with the server, whatever ran when it went down.
  boot: z.boolean().default(false),
  runtimes: ProjectRuntimesSchema.optional(),
})

export const ProjectSchema = ProjectBaseSchema.extend({
  path: AbsolutePathSchema,
  processes: z.array(ProcessSchema).min(1),
  state: ProjectStateSchema,
  boot: z.boolean().default(false),
  runtimes: ProjectRuntimesSchema.optional(),
  // The address of the first process whose main port carries a name on the web.
  url: z.string().optional(),
  // What HEAD reads as, a hash on a detached checkout: looser than a registration's branch.
  branch: z.string().optional(),
})

export type Project = z.infer<typeof ProjectSchema>

const SESSION_KINDS = [
  "claude",
  "codex",
  "cursor",
  "gemini",
  "copilot",
  "opencode",
  "hermes",
  "ide",
  "shell",
] as const

const SessionKindSchema = z.enum(SESSION_KINDS)

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

export const ServiceStatusParamsSchema = z.strictObject({
  id: z.string().min(1),
})

export const LOGIN_STATES = ["signed_in", "signed_out", "unknown"] as const

const LoginStateSchema = z.enum(LOGIN_STATES)

export type LoginState = z.infer<typeof LoginStateSchema>

const LoginSchema = z.object({
  state: LoginStateSchema,
  account: z.string().optional(),
  fix: z.string().optional(),
})

export type Login = z.infer<typeof LoginSchema>

export const ServiceStatusResultSchema = ServiceSchema.extend({
  credentials: z.record(z.string(), z.string()).optional(),
  // Asking the CLI can cost a network round trip, so a snapshot never carries it.
  login: LoginSchema.optional(),
})

export type ServiceStatusResult = z.infer<typeof ServiceStatusResultSchema>

export const ServiceActionParamsSchema = ServiceStatusParamsSchema

export const ServiceLogsParamsSchema = z.strictObject({
  id: z.string().min(1),
  lines: z.int().positive().optional(),
  follow: z.boolean().optional(),
})

export const ServiceLogsResultSchema = z.object({
  lines: z.array(z.string()),
})

export type ServiceLogsResult = z.infer<typeof ServiceLogsResultSchema>

const SubCommandSchema = z.object({
  name: z.string(),
  help: z.string(),
  args: z.array(z.array(z.string())),
})

export const CompletionsParamsSchema = z.strictObject({
  path: z.string().optional(),
})

export const CompletionsResultSchema = z.object({
  command: z.string(),
  sub: z.array(SubCommandSchema),
  projects: z.array(z.string()),
  // `path` is read under `root` and never above; entries are relative to it, folders end in a slash.
  root: z.string(),
  path: z.string(),
  paths: z.array(z.string()),
})

export type CompletionsResult = z.infer<typeof CompletionsResultSchema>
