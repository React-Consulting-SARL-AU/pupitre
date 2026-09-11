import { z } from "zod"
import { PortSchema } from "./ports"
import {
  GitBranchSchema,
  HostnameSchema,
  PackageManagerSchema,
  ProjectNameSchema,
  ProjectRegistrationSchema,
  ProjectSchema,
  ProjectStateSchema,
  ProjectSubdomainSchema,
  RouteLabelSchema,
} from "./state"

export const ProjectParamsSchema = z.strictObject({
  name: ProjectNameSchema,
})

export type ProjectParams = z.infer<typeof ProjectParamsSchema>

export const ProjectTargetSchema = z.union([
  ProjectNameSchema,
  z.literal("all"),
])

export const ProjectTargetParamsSchema = z.strictObject({
  name: ProjectTargetSchema,
})

export type ProjectTargetParams = z.infer<typeof ProjectTargetParamsSchema>

export const ProjectListResultSchema = z.object({
  projects: z.array(ProjectSchema),
})

export type ProjectListResult = z.infer<typeof ProjectListResultSchema>

export const ProjectAddParamsSchema = ProjectRegistrationSchema.strict()

export type ProjectAddParams = z.infer<typeof ProjectAddParamsSchema>

export const ProjectAddResultSchema = ProjectSchema

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
 * What can change about a declared project without removing it.
 *
 * `routes` replaces the whole list: the screen sends what it shows, and a route
 * missing from it is a route that goes. An empty `install` hands the command
 * back to the package manager.
 */
export const ProjectPatchSchema = z.strictObject({
  cmd: z.string().min(1).optional(),
  install: z.string().optional(),
  branch: GitBranchSchema.optional(),
  routes: z.array(RoutePatchSchema).optional(),
})

export type ProjectPatch = z.infer<typeof ProjectPatchSchema>

export const ProjectUpdateParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  patch: ProjectPatchSchema,
})

export type ProjectUpdateParams = z.infer<typeof ProjectUpdateParamsSchema>

export const ProjectUpdateResultSchema = ProjectSchema

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

export const ProjectDetectResultSchema = z.object({
  pkgmgr: PackageManagerSchema,
  install: z.string().optional(),
  cmd: z.string().optional(),
  port_hint: PortSchema.optional(),
  /** The ports of a monorepo's workspaces, when the root runs them all at once. */
  routes: z.array(DetectedRouteSchema).optional(),
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
  port: PortSchema.optional(),
})

export type ProjectStateEntry = z.infer<typeof ProjectStateEntrySchema>

export const ProjectActionResultSchema = z.object({
  state: ProjectStateSchema,
  port: PortSchema.optional(),
  projects: z.array(ProjectStateEntrySchema).optional(),
})

export type ProjectActionResult = z.infer<typeof ProjectActionResultSchema>

export const ProjectLogsParamsSchema = z.strictObject({
  name: ProjectNameSchema,
  lines: z.int().positive().optional(),
  follow: z.boolean().optional(),
})

export type ProjectLogsParams = z.infer<typeof ProjectLogsParamsSchema>

export const ProjectLogsResultSchema = z.object({
  lines: z.array(z.string()),
})

export type ProjectLogsResult = z.infer<typeof ProjectLogsResultSchema>

export const ProjectSyncResultSchema = z.object({
  pulled: z.boolean(),
  installed: z.boolean(),
  state: ProjectStateSchema,
})

export type ProjectSyncResult = z.infer<typeof ProjectSyncResultSchema>

export const ProjectEnvParamsSchema = z.strictObject({
  name: ProjectNameSchema,
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
  state: ProjectStateSchema,
  port: PortSchema.optional(),
  debug_port: PortSchema,
})

export type ProjectDebugResult = z.infer<typeof ProjectDebugResultSchema>
