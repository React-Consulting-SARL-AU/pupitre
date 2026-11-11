import { z } from "zod"
import { ModuleConfigSchema } from "../agent-protocol/install"
import {
  ProjectAddParamsSchema,
  ProjectUpdateParamsSchema,
} from "../agent-protocol/projects"
import { GitBranchSchema, ProjectNameSchema } from "../agent-protocol/state"

export const APP_MCP_NAME = "pupitre"

export const APP_MCP_SOCKET = "mcp.sock"

export const SERVER_MCP_COMMAND = "/usr/local/bin/pupitred"

const CLIENT_NAME_UNFIT = /[^A-Za-z0-9_-]+/g

const MACHINE_PREFIX = `${APP_MCP_NAME}-`

/** A client names a server with letters, digits, `-` and `_`; an app alias already starts with the prefix. */
export function machineMcpName(sshName: string): string {
  const fit = sshName.replace(CLIENT_NAME_UNFIT, "-")

  return fit.startsWith(MACHINE_PREFIX) ? fit : `${MACHINE_PREFIX}${fit}`
}

export function isPupitreMcpName(name: string): boolean {
  return name === APP_MCP_NAME || name.startsWith(MACHINE_PREFIX)
}

const ServerArgSchema = z
  .string()
  .min(1)
  .describe("The server's id, as `servers` lists it")

const ModuleIdsSchema = z.array(z.string().min(1)).min(1)

export const APP_MCP_TOOLS = {
  servers: z.strictObject({}),
  catalog: z.strictObject({ server: ServerArgSchema }),
  project_list: z.strictObject({ server: ServerArgSchema }),
  project_detect: z.strictObject({
    server: ServerArgSchema,
    repo: z.string().min(1).optional(),
    branch: GitBranchSchema.optional(),
    dir: z.string().min(1).optional(),
  }),
  module_install: z.strictObject({
    server: ServerArgSchema,
    modules: ModuleIdsSchema,
    config: ModuleConfigSchema.optional(),
  }),
  module_uninstall: z.strictObject({
    server: ServerArgSchema,
    modules: ModuleIdsSchema,
  }),
  project_add: z.strictObject({
    server: ServerArgSchema,
    project: ProjectAddParamsSchema,
  }),
  project_update: ProjectUpdateParamsSchema.extend({ server: ServerArgSchema }),
  project_remove: z.strictObject({
    server: ServerArgSchema,
    name: ProjectNameSchema,
  }),
} as const

export type AppMcpTool = keyof typeof APP_MCP_TOOLS

// Read by the model like the server's own tools: one language for the whole contract.
export const APP_MCP_INSTRUCTIONS =
  "Pupitre sets up the owner's servers: the services installed from its catalogue and the projects declared on each machine. " +
  "Call servers first. To start, stop or restart a project or a service, or to read its logs, use the MCP server named in that " +
  "machine's entry, never this one. A change here may wait for the owner to allow it in the Pupitre app; a refused one is not retried " +
  "without asking them. Secrets are never " +
  "passed here: the owner fills them in the app."

export const APP_MCP_TEXTS: Record<
  AppMcpTool,
  { title: string; description: string }
> = {
  catalog: {
    description:
      "The modules this server can install, with their state, their configuration fields and their current values.",
    title: "Service catalogue",
  },
  module_install: {
    description:
      "Install modules from the catalogue, or reconfigure installed ones, with config keyed by module id then field key. " +
      "The configuration is checked first; the owner then allows or refuses in the app. Secret fields are refused: the owner fills them in the app.",
    title: "Install or reconfigure modules",
  },
  module_uninstall: {
    description:
      "Uninstall modules from the server, after the owner allows it in the app.",
    title: "Uninstall modules",
  },
  project_add: {
    description:
      "Declare a project on the server: its repository, branch and processes. Use project_detect first to read the processes from the repository. The owner allows or refuses in the app.",
    title: "Declare a project",
  },
  project_detect: {
    description:
      "Read a repository (repo, with an optional branch) or a folder already on the server (dir) and propose the project's processes, without declaring anything.",
    title: "Detect a project",
  },
  project_list: {
    description:
      "The projects declared on the server with their settings: repository, branch, processes, ports and addresses.",
    title: "Projects and their settings",
  },
  project_remove: {
    description:
      "Remove a project from the server: its processes stop and its addresses go; its folder stays. The owner allows or refuses in the app.",
    title: "Remove a project",
  },
  project_update: {
    description:
      "Change a declared project's settings with a patch: branch, boot, protected, runtimes, processes. processes replaces the whole list: " +
      "send every process complete, as project_list gives it, install included, or what is left out goes back to its default. The owner allows or refuses in the app.",
    title: "Change a project",
  },
  servers: {
    description:
      "The servers this app manages: their id, their name and the MCP server that runs their projects and services.",
    title: "Servers",
  },
}

export type AppMcpArgs<T extends AppMcpTool> = z.output<
  (typeof APP_MCP_TOOLS)[T]
>

/** The tools that change a machine: each one waits for the owner's answer in the app. */
export const CONFIRMED_TOOLS: ReadonlySet<AppMcpTool> = new Set<AppMcpTool>([
  "module_install",
  "module_uninstall",
  "project_add",
  "project_update",
  "project_remove",
])

export function isAppMcpTool(name: string): name is AppMcpTool {
  return Object.hasOwn(APP_MCP_TOOLS, name)
}

export const MCP_CLIENTS = ["claude-code", "claude-desktop", "codex"] as const

export type McpClient = (typeof MCP_CLIENTS)[number]

export interface McpClientState {
  id: McpClient
  found: boolean
  /** The `pupitre*` entries the client holds, read back from it rather than assumed. */
  declared: string[]
  problem?: string
}

export interface LocalAgentsState {
  enabled: boolean
  /** Changes run without the app's allow dialog. */
  unattended: boolean
  /** False on Windows: the app's server rides a Unix socket. */
  supported: boolean
  clients: McpClientState[]
  /** The entries laid for the machines, by server name. */
  machines: { serverName: string; entry: string }[]
}
