import { z } from "zod"
import {
  ArchitectureSchema,
  ConnectionKindSchema,
  RuntimeToolSchema,
} from "../catalog"
import { PortSchema } from "./ports"
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

/**
 * `configured` says whether the module has been through its own settings.
 *
 * A module can sit on a machine without having been configured: the reader
 * asked to answer its questions later, and the install put it there and stopped.
 * The screen has to be able to say so, and to offer the form that finishes it.
 *
 * `runs` and `connection` are the manifest's own answers, carried here so that
 * a screen showing what the machine is doing never has to read the catalogue
 * to know it: whether the module holds a process, and which third-party
 * account the app must hold for it.
 *
 * `path` is the absolute folder a module laid on the machine when something
 * on the reader's side has to be pointed at it — the backend JetBrains Gateway
 * opens. Only the agent knows where it put it.
 */
export const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: ServiceStateSchema,
  configured: z.boolean().default(true),
  runs: z.boolean().default(true),
  connection: ConnectionKindSchema.optional(),
  version: z.string().optional(),
  /** The majors a runtime holds, newest first: what a project may pin. */
  versions: z.array(z.string()).optional(),
  port: z.int().min(1).max(65_535).optional(),
  unit: z.string().optional(),
  path: z.string().optional(),
})

export type Service = z.infer<typeof ServiceSchema>

export const PROCESS_STATES = [
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

/**
 * A project's state is read off its processes: failed if one failed, starting
 * if one starts, online when all run, `partial` when only some do, stopped
 * otherwise. `partial` is the one state a process never has by itself.
 */
export const PROJECT_STATES = [...PROCESS_STATES, "partial"] as const

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

/**
 * The name a project answers to under the server's domain.
 *
 * One label is what a Cloudflare universal certificate covers, and it stays
 * what the app proposes. Several, separated by dots, are the client's own call
 * — their zone, their certificate — so the contract accepts them and the screen
 * says what it costs. Each label is a DNS label: it opens and closes on a
 * letter or a digit, dashes live in between.
 */
export const SUBDOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"

export const SUBDOMAIN_PATTERN = new RegExp(
  `^${SUBDOMAIN_LABEL}(?:\\.${SUBDOMAIN_LABEL})*$`
)

/** What is left of the 253 octets of a name once a zone is put after it. */
export const SUBDOMAIN_MAX = 190

export const ProjectSubdomainSchema = z
  .string()
  .min(1)
  .max(SUBDOMAIN_MAX)
  .regex(SUBDOMAIN_PATTERN)

/**
 * A full name on the web, as the registry stores it: the labels of a
 * subdomain, then the labels of the server's domain. Two labels at the least —
 * a bare domain is not something a project answers to.
 */
export const HOSTNAME_PATTERN = new RegExp(
  `^${SUBDOMAIN_LABEL}(?:\\.${SUBDOMAIN_LABEL})+$`
)

export const HOSTNAME_MAX = 253

export const HostnameSchema = z
  .string()
  .min(1)
  .max(HOSTNAME_MAX)
  .regex(HOSTNAME_PATTERN)

/**
 * The short name of one port of a project — `web`, `api`, `docs`.
 *
 * It is one DNS label, because it is what the app puts in front of the
 * subdomain to name the other ports: `api-shop.example.org`.
 */
export const ROUTE_LABEL_MAX = 63

export const RouteLabelSchema = z
  .string()
  .min(1)
  .max(ROUTE_LABEL_MAX)
  .regex(new RegExp(`^${SUBDOMAIN_LABEL}$`))

/**
 * One port a project listens on, and the name it answers to on the web when it
 * has one.
 *
 * The hostname is stored whole, resolved once by the agent when the route is
 * declared: a name on the web does not move because the server's domain did.
 * A route without a hostname is a port the screen lists and nobody publishes.
 */
export const RouteSchema = z.object({
  label: RouteLabelSchema,
  port: PortSchema,
  hostname: HostnameSchema.optional(),
})

export type Route = z.infer<typeof RouteSchema>

/**
 * A route as the app declares it: a subdomain, which the agent completes with
 * the domain it knows, or nothing, for a port that stays local.
 */
export const RouteRequestSchema = z.strictObject({
  label: RouteLabelSchema,
  port: PortSchema,
  subdomain: ProjectSubdomainSchema.optional(),
})

export type RouteRequest = z.infer<typeof RouteRequestSchema>

/** A git branch, as git itself will accept it on a clone or a checkout. */
export const GitBranchSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)

/** A name under `.localhost`, the one kind of host the agent points at the machine itself. */
export const LocalhostNameSchema = z
  .string()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+localhost$/)

/**
 * The short name of one process of a project — `server`, `client`, `web`.
 *
 * One DNS label, like a route's: it is what names the tmux window and the log
 * file, `<project>/<process>`, and neither name admits a slash.
 */
export const ProcessIdSchema = RouteLabelSchema

export type ProcessId = z.infer<typeof ProcessIdSchema>

/** The folder a process runs from, relative to its project: `.` for the root. */
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
  /** The main port: the one that decides the state, and the local address. */
  port: PortSchema,
  cmd: z.string().min(1),
  install: z.string().optional(),
})

/**
 * A process as the app declares it. `routes` lists every port the screen
 * showed, the main one first when it is among them: the agent resolves each
 * name on the web once, and stores it.
 */
export const ProcessRegistrationSchema = ProcessBaseSchema.extend({
  dir: ProcessDirSchema.default(PROJECT_ROOT_DIR),
  /** The loopback, or a `.localhost` name the agent points at it in /etc/hosts. */
  host: z.union([z.literal("127.0.0.1"), LocalhostNameSchema]),
  routes: z.array(RouteRequestSchema),
}).strict()

export type ProcessRegistration = z.infer<typeof ProcessRegistrationSchema>

export const AbsolutePathSchema = z.string().regex(/^\//)

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

/** A major, or a major and minor, as the runtime's versions field lists them: `22`, `3.12`. */
export const RuntimeVersionSchema = z.string().regex(/^[0-9]+(\.[0-9]+)*$/)

/**
 * The runtime versions a project runs on, by mise tool name: `{ node: "22" }`.
 * Each is one the runtime's service has installed; a tool named by no entry
 * runs at the machine's default.
 */
export const ProjectRuntimesSchema = z.partialRecord(
  RuntimeToolSchema,
  RuntimeVersionSchema
)

export type ProjectRuntimes = z.infer<typeof ProjectRuntimesSchema>

const ProjectBaseSchema = z.object({
  name: ProjectNameSchema,
  dir: z.string().min(1),
  repo: z.string().optional(),
  /** The branch to clone; absent, the repository's own default is taken. */
  branch: GitBranchSchema.optional(),
})

/**
 * A project is a repository, or a folder: its processes are what runs in it,
 * one at the least, each from its own folder with its own command.
 */
export const ProjectRegistrationSchema = ProjectBaseSchema.extend({
  processes: z
    .array(ProcessRegistrationSchema)
    .min(1)
    .refine(uniqueProcessIds, "two processes of a project cannot share an id"),
  /** Whether the project starts with the server, whatever ran when it went down. */
  boot: z.boolean().default(false),
  /** Absent, the project names no version: every runtime runs at the machine's default. */
  runtimes: ProjectRuntimesSchema.optional(),
})

export type ProjectRegistration = z.infer<typeof ProjectRegistrationSchema>

export const ProjectSchema = ProjectBaseSchema.extend({
  path: AbsolutePathSchema,
  processes: z.array(ProcessSchema).min(1),
  state: ProjectStateSchema,
  boot: z.boolean().default(false),
  runtimes: ProjectRuntimesSchema.optional(),
  /** The address of the first process whose main port carries a name on the web. */
  url: z.string().optional(),
  // Here the branch is what HEAD reads as, which a detached checkout makes a
  // hash rather than a name: looser than the branch a registration asks for.
  branch: z.string().optional(),
})

export type Project = z.infer<typeof ProjectSchema>

export const SESSION_KINDS = [
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

export const LOGIN_STATES = ["signed_in", "signed_out", "unknown"] as const

export const LoginStateSchema = z.enum(LOGIN_STATES)

export type LoginState = z.infer<typeof LoginStateSchema>

/**
 * Whether the CLI a module installs is signed in to its account, asked of the
 * CLI itself.
 *
 * `signed_in` names the account when the CLI does — a login, an email, an
 * account name. `signed_out` is a CLI that holds nothing, or that its own
 * check refuses. `unknown` is a CLI that could not be asked: the token is
 * there but the provider did not answer. `fix` says how to sign in, in the
 * session's language, when there is something to do.
 *
 * Asking can cost a network round trip, so only `service.status` carries it —
 * never a snapshot read every few seconds. A module whose CLI has no account
 * omits it.
 */
export const LoginSchema = z.object({
  state: LoginStateSchema,
  account: z.string().optional(),
  fix: z.string().optional(),
})

export type Login = z.infer<typeof LoginSchema>

export const ServiceStatusResultSchema = ServiceSchema.extend({
  credentials: z.record(z.string(), z.string()).optional(),
  login: LoginSchema.optional(),
})

export type ServiceStatusResult = z.infer<typeof ServiceStatusResultSchema>

/**
 * `service.start`, `service.stop` and `service.restart` address the systemd
 * unit the module declares, and answer with the state the unit is actually in
 * once systemd has had its say — never with the intention.
 */
export const ServiceActionParamsSchema = ServiceStatusParamsSchema

export type ServiceActionParams = z.infer<typeof ServiceActionParamsSchema>

export const ServiceLogsParamsSchema = z.strictObject({
  id: z.string().min(1),
  lines: z.int().positive().optional(),
  follow: z.boolean().optional(),
})

export type ServiceLogsParams = z.infer<typeof ServiceLogsParamsSchema>

export const ServiceLogsResultSchema = z.object({
  lines: z.array(z.string()),
})

export type ServiceLogsResult = z.infer<typeof ServiceLogsResultSchema>

export const SubCommandSchema = z.object({
  name: z.string(),
  help: z.string(),
  args: z.array(z.array(z.string())),
})

export type SubCommand = z.infer<typeof SubCommandSchema>

export const CompletionsParamsSchema = z.strictObject({
  path: z.string().optional(),
})

export type CompletionsParams = z.infer<typeof CompletionsParamsSchema>

/**
 * `path` is read under `root`, the projects folder, and never above it. Entries
 * come back relative to the folder listed, directories with a trailing slash.
 */
export const CompletionsResultSchema = z.object({
  command: z.string(),
  sub: z.array(SubCommandSchema),
  projects: z.array(z.string()),
  root: z.string(),
  path: z.string(),
  paths: z.array(z.string()),
})

export type CompletionsResult = z.infer<typeof CompletionsResultSchema>
