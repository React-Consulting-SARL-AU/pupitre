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

export const ProcessParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  process: ProcessIdSchema,
})

const ProjectTargetSchema = z.union([ProjectNameSchema, z.literal("all")])

export const ProjectTargetParamsSchema = z
  .strictObject({
    name: ProjectTargetSchema,
    process: ProcessIdSchema.optional(),
  })
  .refine((target) => !(target.name === "all" && target.process), {
    message: "all names no process",
  })

export const ProjectListResultSchema = z.object({
  projects: z.array(ProjectSchema),
})

export type ProjectListResult = z.infer<typeof ProjectListResultSchema>

export const ProjectAddParamsSchema = ProjectRegistrationSchema.strict()

export type ProjectAddParams = z.infer<typeof ProjectAddParamsSchema>

const DeclaredProjectSchema = ProjectSchema.extend({
  // What failed once the project's line was written: the line stands, so a retry would only say it is declared.
  warnings: z.array(z.string()).optional(),
})

export const ProjectAddResultSchema = DeclaredProjectSchema

export type ProjectAddResult = z.infer<typeof ProjectAddResultSchema>

// A subdomain the agent completes with the server's domain, or a whole hostname; neither keeps the port local.
const RoutePatchSchema = z
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

const ProcessPatchSchema = z.strictObject({
  id: ProcessIdSchema,
  dir: ProcessDirSchema.default(PROJECT_ROOT_DIR),
  pkgmgr: PackageManagerSchema,
  host: z.union([z.literal("127.0.0.1"), LocalhostNameSchema]),
  port: PortSchema,
  cmd: z.string().min(1),
  // Empty hands the command back to the package manager.
  install: z.string().optional(),
  routes: z.array(RoutePatchSchema),
  // Absent follows the project.
  protected: z.boolean().optional(),
})

export type ProcessPatch = z.infer<typeof ProcessPatchSchema>

const ProjectPatchSchema = z.strictObject({
  branch: GitBranchSchema.optional(),
  boot: z.boolean().optional(),
  // Replaces the whole map: a missing tool goes back to the machine's default.
  runtimes: ProjectRuntimesSchema.optional(),
  protected: z.boolean().optional(),
  // Replaces the whole list: a missing process goes, one whose command changed restarts.
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

export const ProjectDetectParamsSchema = z.union([
  z.strictObject({
    repo: z.string().min(1),
    branch: GitBranchSchema.optional(),
  }),
  z.strictObject({ dir: z.string().min(1) }),
])

export type ProjectDetectParams = z.infer<typeof ProjectDetectParamsSchema>

const DetectedRouteSchema = z.object({
  label: RouteLabelSchema,
  port: PortSchema,
})

export type DetectedRoute = z.infer<typeof DetectedRouteSchema>

// The root, or a first-level folder with its own manifest outside the root's workspaces.
const DetectedProcessSchema = z.object({
  id: ProcessIdSchema,
  dir: ProcessDirSchema,
  pkgmgr: PackageManagerSchema,
  install: z.string().optional(),
  cmd: z.string().optional(),
  port_hint: PortSchema.optional(),
  // The `.localhost` name a start script freezes: the host to declare so the machine answers to it.
  host_hint: LocalhostNameSchema.optional(),
  // A monorepo's workspace ports, when the root runs them all at once.
  routes: z.array(DetectedRouteSchema).optional(),
})

export type DetectedProcess = z.infer<typeof DetectedProcessSchema>

// The root always answers: a folder with no manifest is a process without a command.
export const ProjectDetectResultSchema = z.object({
  processes: z.array(DetectedProcessSchema).min(1),
})

export type ProjectDetectResult = z.infer<typeof ProjectDetectResultSchema>

export const ProjectRemoveResultSchema = z.object({
  name: ProjectNameSchema,
  dir: z.string(),
})

export type ProjectRemoveResult = z.infer<typeof ProjectRemoveResultSchema>

const ProjectStateEntrySchema = z.object({
  name: ProjectNameSchema,
  state: ProjectStateSchema,
})

export const ProjectActionResultSchema = z.object({
  state: ProjectStateSchema,
  // Every project's, when the target was `all`.
  projects: z.array(ProjectStateEntrySchema).optional(),
})

export type ProjectActionResult = z.infer<typeof ProjectActionResultSchema>

export const ProjectLogsParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  process: ProcessIdSchema,
  lines: z.int().positive().optional(),
  follow: z.boolean().optional(),
})

export const ProjectLogsResultSchema = z.object({
  lines: z.array(z.string()),
})

export type ProjectLogsResult = z.infer<typeof ProjectLogsResultSchema>

export const ProjectPullResultSchema = z.object({
  // False for a folder without a repository.
  pulled: z.boolean(),
  state: ProjectStateSchema,
})

export type ProjectPullResult = z.infer<typeof ProjectPullResultSchema>

export const ProjectSyncResultSchema = ProjectPullResultSchema.extend({
  installed: z.boolean(),
})

export type ProjectSyncResult = z.infer<typeof ProjectSyncResultSchema>

export const ProjectInstallParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  process: ProcessIdSchema.optional(),
})

const ProcessInstallSchema = z.object({
  process: ProcessIdSchema,
  command: z.string().min(1),
})

export const ProjectInstallResultSchema = z.object({
  done: z.literal(true),
  // A process that declares no install line is not in it.
  installed: z.array(ProcessInstallSchema),
})

export type ProjectInstallResult = z.infer<typeof ProjectInstallResultSchema>

export const ProjectEnvParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  // The folder of one of its processes, when the template lives there.
  process: ProcessIdSchema.optional(),
  force: z.boolean().optional(),
})

// A repository that versions no template is not a refusal: `keys` is empty and `template` false.
export const ProjectEnvResultSchema = z.object({
  path: z.string(),
  written: z.boolean(),
  keys: z.array(z.string()),
  template: z.boolean(),
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

const FILE_STAGES = ["staged", "unstaged", "untracked"] as const

const FileStageSchema = z.enum(FILE_STAGES)

const FileChangeSchema = z.object({
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
