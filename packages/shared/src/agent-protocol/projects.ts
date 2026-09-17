import { z } from "zod"
import { PortSchema } from "./ports"
import {
  GitBranchSchema,
  HostnameSchema,
  LocalhostNameSchema,
  PackageManagerSchema,
  PROJECT_ROOT_DIR,
  ProcessDirSchema,
  ProcessIdSchema,
  ProcessStateSchema,
  ProjectNameSchema,
  ProjectRegistrationSchema,
  ProjectRuntimesSchema,
  ProjectSchema,
  ProjectStateSchema,
  ProjectSubdomainSchema,
  RouteLabelSchema,
  uniqueProcessIds,
} from "./state"

export const ProjectParamsSchema = z.strictObject({
  name: ProjectNameSchema,
})

export type ProjectParams = z.infer<typeof ProjectParamsSchema>

/** A project and one of its processes: what the logs and the debugger are read on. */
export const ProcessParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  process: ProcessIdSchema,
})

export type ProcessParams = z.infer<typeof ProcessParamsSchema>

export const ProjectTargetSchema = z.union([
  ProjectNameSchema,
  z.literal("all"),
])

/**
 * What up, down and restart act on: a project, every project, or one process
 * of a project. `all` names no process — it has none in particular.
 */
export const ProjectTargetParamsSchema = z
  .strictObject({
    name: ProjectTargetSchema,
    process: ProcessIdSchema.optional(),
  })
  .refine((target) => !(target.name === "all" && target.process), {
    message: "all names no process",
  })

export type ProjectTargetParams = z.infer<typeof ProjectTargetParamsSchema>

export const ProjectListResultSchema = z.object({
  projects: z.array(ProjectSchema),
})

export type ProjectListResult = z.infer<typeof ProjectListResultSchema>

export const ProjectAddParamsSchema = ProjectRegistrationSchema.strict()

export type ProjectAddParams = z.infer<typeof ProjectAddParamsSchema>

/**
 * The declared project, and what failed once its line was written: a folder
 * that could not be created, a runtime pin, a start. The line stands either
 * way, so a retry would only answer that the project is declared already.
 */
export const DeclaredProjectSchema = ProjectSchema.extend({
  warnings: z.array(z.string()).optional(),
})

export type DeclaredProject = z.infer<typeof DeclaredProjectSchema>

export const ProjectAddResultSchema = DeclaredProjectSchema

export type ProjectAddResult = z.infer<typeof ProjectAddResultSchema>

/**
 * A route as the configuration screen sends it back: a subdomain for the agent
 * to complete with the server's domain, or a whole hostname for a reader who
 * wants another one — never both, and neither for a port that stays local.
 */
export const RoutePatchSchema = z
  .strictObject({
    label: RouteLabelSchema,
    port: PortSchema,
    subdomain: ProjectSubdomainSchema.optional(),
    hostname: HostnameSchema.optional(),
  })
  .refine((route) => !(route.subdomain && route.hostname), {
    message: "a route names a subdomain or a hostname, not both",
  })

export type RoutePatch = z.infer<typeof RoutePatchSchema>

/**
 * A process as the configuration screen sends it back: the whole of it, its
 * routes included, each a subdomain or a hostname.
 */
export const ProcessPatchSchema = z.strictObject({
  id: ProcessIdSchema,
  dir: ProcessDirSchema.default(PROJECT_ROOT_DIR),
  pkgmgr: PackageManagerSchema,
  host: z.union([z.literal("127.0.0.1"), LocalhostNameSchema]),
  port: PortSchema,
  cmd: z.string().min(1),
  install: z.string().optional(),
  routes: z.array(RoutePatchSchema),
})

export type ProcessPatch = z.infer<typeof ProcessPatchSchema>

/**
 * What can change about a declared project without removing it.
 *
 * `processes` replaces the whole list: the screen sends what it shows, a
 * process missing from it is a process that goes, and one whose command
 * changed restarts if it was running. An empty `install` hands the command
 * back to the package manager. `runtimes` replaces the whole map: a tool
 * missing from it goes back to the machine's default.
 */
export const ProjectPatchSchema = z.strictObject({
  branch: GitBranchSchema.optional(),
  boot: z.boolean().optional(),
  runtimes: ProjectRuntimesSchema.optional(),
  processes: z
    .array(ProcessPatchSchema)
    .min(1)
    .refine(uniqueProcessIds, "two processes of a project cannot share an id")
    .optional(),
})

export type ProjectPatch = z.infer<typeof ProjectPatchSchema>

export const ProjectUpdateParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  patch: ProjectPatchSchema,
})

export type ProjectUpdateParams = z.infer<typeof ProjectUpdateParamsSchema>

export const ProjectUpdateResultSchema = DeclaredProjectSchema

export type ProjectUpdateResult = z.infer<typeof ProjectUpdateResultSchema>

/**
 * A repository, or a folder relative to the projects root — one of the two,
 * never both. A branch only means something for a repository: a folder already
 * on the machine is read as it stands.
 */
export const ProjectDetectParamsSchema = z.union([
  z.strictObject({
    repo: z.string().min(1),
    branch: GitBranchSchema.optional(),
  }),
  z.strictObject({ dir: z.string().min(1) }),
])

export type ProjectDetectParams = z.infer<typeof ProjectDetectParamsSchema>

/** One port a workspace of a monorepo asks for, named after that workspace. */
export const DetectedRouteSchema = z.object({
  label: RouteLabelSchema,
  port: PortSchema,
})

export type DetectedRoute = z.infer<typeof DetectedRouteSchema>

/**
 * What one folder of the repository asks for: the root, or a folder of the
 * first level that carries its own manifest outside the root's workspaces.
 */
export const DetectedProcessSchema = z.object({
  id: ProcessIdSchema,
  dir: ProcessDirSchema,
  pkgmgr: PackageManagerSchema,
  install: z.string().optional(),
  cmd: z.string().optional(),
  port_hint: PortSchema.optional(),
  /** The `.localhost` name the start script binds to, when it freezes one: the host to declare, so the machine answers to it. */
  host_hint: LocalhostNameSchema.optional(),
  /** The ports of a monorepo's workspaces, when the root runs them all at once. */
  routes: z.array(DetectedRouteSchema).optional(),
})

export type DetectedProcess = z.infer<typeof DetectedProcessSchema>

/** The root always answers, even with nothing to run: a folder with no manifest is a process without a command. */
export const ProjectDetectResultSchema = z.object({
  processes: z.array(DetectedProcessSchema).min(1),
})

export type ProjectDetectResult = z.infer<typeof ProjectDetectResultSchema>

export const ProjectRemoveResultSchema = z.object({
  name: ProjectNameSchema,
  dir: z.string(),
})

export type ProjectRemoveResult = z.infer<typeof ProjectRemoveResultSchema>

export const ProjectStateEntrySchema = z.object({
  name: ProjectNameSchema,
  state: ProjectStateSchema,
})

export type ProjectStateEntry = z.infer<typeof ProjectStateEntrySchema>

/** The state of what was acted on: the project's, or every project's when the target was `all`. */
export const ProjectActionResultSchema = z.object({
  state: ProjectStateSchema,
  projects: z.array(ProjectStateEntrySchema).optional(),
})

export type ProjectActionResult = z.infer<typeof ProjectActionResultSchema>

export const ProjectLogsParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  process: ProcessIdSchema,
  lines: z.int().positive().optional(),
  follow: z.boolean().optional(),
})

export type ProjectLogsParams = z.infer<typeof ProjectLogsParamsSchema>

export const ProjectLogsResultSchema = z.object({
  lines: z.array(z.string()),
})

export type ProjectLogsResult = z.infer<typeof ProjectLogsResultSchema>

/** The sources brought up to date, and nothing else: `pulled` is false for a folder without a repository. */
export const ProjectPullResultSchema = z.object({
  pulled: z.boolean(),
  state: ProjectStateSchema,
})

export type ProjectPullResult = z.infer<typeof ProjectPullResultSchema>

export const ProjectSyncResultSchema = ProjectPullResultSchema.extend({
  installed: z.boolean(),
})

export type ProjectSyncResult = z.infer<typeof ProjectSyncResultSchema>

/** One project, or one of its processes: what install runs on. */
export const ProjectInstallParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  process: ProcessIdSchema.optional(),
})

export type ProjectInstallParams = z.infer<typeof ProjectInstallParamsSchema>

export const ProcessInstallSchema = z.object({
  process: ProcessIdSchema,
  command: z.string().min(1),
})

export type ProcessInstall = z.infer<typeof ProcessInstallSchema>

/** `installed` lists the install lines that ran, one per process that declares one; a process without one is not in it. */
export const ProjectInstallResultSchema = z.object({
  done: z.literal(true),
  installed: z.array(ProcessInstallSchema),
})

export type ProjectInstallResult = z.infer<typeof ProjectInstallResultSchema>

/** The project's root, or the folder of one of its processes when the template lives there. */
export const ProjectEnvParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  process: ProcessIdSchema.optional(),
  force: z.boolean().optional(),
})

export type ProjectEnvParams = z.infer<typeof ProjectEnvParamsSchema>

export const ProjectEnvResultSchema = z.object({
  path: z.string(),
  written: z.boolean(),
  keys: z.array(z.string()),
})

export type ProjectEnvResult = z.infer<typeof ProjectEnvResultSchema>

export const ProjectBranchesResultSchema = z.object({
  repo: z.boolean(),
  root: z.string(),
  current: z.string(),
  dirty: z.boolean(),
  local: z.array(z.string()),
  remote: z.array(z.string()),
})

export type ProjectBranchesResult = z.infer<typeof ProjectBranchesResultSchema>

export const ProjectCheckoutParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  branch: z.string().min(1),
})

export type ProjectCheckoutParams = z.infer<typeof ProjectCheckoutParamsSchema>

export const ProjectCheckoutResultSchema = z.object({
  branch: z.string(),
})

export type ProjectCheckoutResult = z.infer<typeof ProjectCheckoutResultSchema>

export const ProjectGitStatusResultSchema = z.object({
  repo: z.boolean(),
  root: z.string(),
  current: z.string(),
  upstream: z.string(),
  behind: z.int().nonnegative(),
  ahead: z.int().nonnegative(),
  dirty: z.boolean(),
  changed: z.int().nonnegative(),
  last: z.int().nonnegative(),
  subject: z.string(),
  problem: z.string(),
})

export type ProjectGitStatusResult = z.infer<
  typeof ProjectGitStatusResultSchema
>

export const FILE_STAGES = ["staged", "unstaged", "untracked"] as const

export const FileStageSchema = z.enum(FILE_STAGES)

export const FileChangeSchema = z.object({
  path: z.string(),
  code: z.string(),
  stage: FileStageSchema,
  added: z.int().min(-1),
  removed: z.int().min(-1),
  binary: z.boolean(),
  from: z.string().optional(),
})

export type FileChange = z.infer<typeof FileChangeSchema>

export const ProjectWorkingTreeResultSchema = z.object({
  repo: z.boolean(),
  root: z.string(),
  branch: z.string(),
  upstream: z.string(),
  ahead: z.int().nonnegative(),
  behind: z.int().nonnegative(),
  files: z.array(FileChangeSchema),
})

export type ProjectWorkingTreeResult = z.infer<
  typeof ProjectWorkingTreeResultSchema
>

export const ProjectDiffParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  path: z.string().min(1),
})

export type ProjectDiffParams = z.infer<typeof ProjectDiffParamsSchema>

export const ProjectDiffResultSchema = z.object({
  path: z.string(),
  patch: z.string(),
  binary: z.boolean(),
  problem: z.string(),
})

export type ProjectDiffResult = z.infer<typeof ProjectDiffResultSchema>

export const ProjectUrlResultSchema = z.object({
  url: z.string(),
})

export type ProjectUrlResult = z.infer<typeof ProjectUrlResultSchema>

export const ProjectDebugResultSchema = z.object({
  state: ProcessStateSchema,
  port: PortSchema,
  debug_port: PortSchema,
})

export type ProjectDebugResult = z.infer<typeof ProjectDebugResultSchema>
