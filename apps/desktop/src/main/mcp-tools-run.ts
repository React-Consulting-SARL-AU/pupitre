import type {
  CatalogResult,
  InstallCheckResult,
  InstallResult,
  ModuleConfig,
  UninstallResult,
} from "@pupitre/shared/agent-protocol/install";
import type {
  ProjectAddParams,
  ProjectAddResult,
  ProjectDetectParams,
  ProjectDetectResult,
  ProjectListResult,
  ProjectRemoveResult,
  ProjectUpdateParams,
  ProjectUpdateResult,
} from "@pupitre/shared/agent-protocol/projects";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import { contractJsonSchema } from "@pupitre/shared/contracts/json-schema";
import {
  APP_MCP_TEXTS,
  APP_MCP_TOOLS,
  type AppMcpArgs,
  type AppMcpTool,
  CONFIRMED_TOOLS,
  LOCAL_TOOLS,
} from "@pupitre/shared/desktop-mcp";
import type { AgentError, AgentResponse, ErrorPhrase } from "@shared/agent";
import type { PortForward } from "@shared/services";
import {
  addLines,
  type ChangeLine,
  detailText,
  moduleLines,
  moduleSubject,
  removeLines,
  type Say,
  updateLines,
} from "./mcp-changes-run";
import { type McpResult, type McpTool, refusal, text } from "./mcp-session";
import type { ForwardOptions } from "./port-forward";

/** What the owner reads before a change runs, worded in the app's language. */
export interface McpRequest {
  tool: AppMcpTool;
  serverId: string;
  serverName: string;
  title: string;
  detail: string;
}

export interface McpMachine {
  id: string;
  name: string;
  /** The client entry that runs and reads this machine's projects and services. */
  entry: string;
}

export interface McpToolDeps {
  machines: () => McpMachine[];
  catalog: (serverId: string) => Promise<AgentResponse<CatalogResult>>;
  projects: (serverId: string) => Promise<AgentResponse<ProjectListResult>>;
  detect: (
    serverId: string,
    params: ProjectDetectParams
  ) => Promise<AgentResponse<ProjectDetectResult>>;
  /** The configuration keys the catalogue marks as secrets, per module. */
  secretFields: (
    serverId: string,
    modules: readonly string[]
  ) => Promise<AgentResponse<Record<string, readonly string[]>>>;
  check: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig
  ) => Promise<AgentResponse<InstallCheckResult>>;
  install: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig
  ) => Promise<AgentResponse<InstallResult>>;
  uninstall: (
    serverId: string,
    modules: readonly string[]
  ) => Promise<AgentResponse<UninstallResult>>;
  addProject: (
    serverId: string,
    params: ProjectAddParams
  ) => Promise<AgentResponse<ProjectAddResult>>;
  updateProject: (
    serverId: string,
    params: ProjectUpdateParams
  ) => Promise<AgentResponse<ProjectUpdateResult>>;
  removeProject: (
    serverId: string,
    name: string
  ) => Promise<AgentResponse<ProjectRemoveResult>>;
  forwards: () => PortForward[];
  openForward: (
    serverId: string,
    port: number,
    opening: ForwardOptions,
    label: string
  ) => Promise<AgentResponse<PortForward>>;
  closeForward: (id: string) => void;
  /** `ssh -L` listens only once authenticated: the model gets an address that answers. */
  listening: (port: number) => Promise<boolean>;
  /** True once the owner allowed it in the app; false when refused, unanswered or with no window to ask in. */
  confirm: (request: McpRequest) => Promise<boolean>;
  /** The owner chose to let changes run without asking. */
  unattended: () => boolean;
  say: Say;
  /** The app's own refusals carry a dictionary id: worded here as the window would. */
  worded: (phrase: ErrorPhrase) => { message: string; fix?: string } | null;
}

const REFUSED_BY_OWNER =
  "The owner did not allow this change in the Pupitre app. Ask them before trying again.";

function json(value: unknown): McpResult {
  return text(JSON.stringify(value, null, 2));
}

function described(error: AgentError, deps: McpToolDeps): string {
  const said = (error.phrase ? deps.worded(error.phrase) : null) ?? error;
  const fix = said.fix ? `\n${said.fix}` : "";

  return `${error.code}: ${said.message}${fix}`;
}

function answered<T>(answer: AgentResponse<T>, deps: McpToolDeps): McpResult {
  return answer.ok
    ? json(answer.result)
    : refusal(described(answer.error, deps));
}

function secretKeysIn(
  config: ModuleConfig,
  secrets: Record<string, readonly string[]>
): string[] {
  return Object.entries(config).flatMap(([module, fields]) =>
    Object.keys(fields)
      .filter((key) => secrets[module]?.includes(key.split(".")[0] ?? key))
      .map((key) => `${module}.${key}`)
  );
}

type MachineTool = Exclude<AppMcpTool, "servers" | "forward_list">;

interface Call<T extends MachineTool> {
  args: AppMcpArgs<T>;
  machine: McpMachine;
  deps: McpToolDeps;
}

const TITLES = {
  module_install: "mcpModuleInstall",
  module_uninstall: "mcpModuleUninstall",
  project_add: "mcpProjectAdd",
  project_remove: "mcpProjectRemove",
  project_update: "mcpProjectUpdate",
} as const;

type ChangeTool = keyof typeof TITLES;

interface Change {
  subject: string;
  lines: ChangeLine[];
}

/** Asked once the arguments are read and the server is known, so the owner never sees a call that could not run. */
async function confirmed<T extends ChangeTool>(
  tool: T,
  { machine, deps }: Call<T>,
  describe: () => Promise<Change>,
  run: () => Promise<AgentResponse<unknown>>
): Promise<McpResult> {
  if (!deps.unattended()) {
    const { subject, lines } = await describe();
    const allowed = await deps.confirm({
      detail: detailText(lines, deps.say("mcpAskedBy")),
      serverId: machine.id,
      serverName: machine.name,
      title: deps.say(TITLES[tool], { server: machine.name, subject }),
      tool,
    });

    if (!allowed) {
      return refusal(REFUSED_BY_OWNER);
    }
  }

  return answered(await run(), deps);
}

/** A project the agent cannot read now is described from the call alone. */
async function heldProject(
  deps: McpToolDeps,
  serverId: string,
  name: string
): Promise<Project | null> {
  const listed = await deps.projects(serverId);

  return listed.ok
    ? (listed.result.projects.find((one) => one.name === name) ?? null)
    : null;
}

async function manifestsOf(
  deps: McpToolDeps,
  serverId: string
): Promise<readonly Manifest[]> {
  const catalog = await deps.catalog(serverId);

  return catalog.ok ? catalog.result.modules : [];
}

async function moduleChange(
  { args, machine, deps }: Call<"module_install" | "module_uninstall">,
  config: ModuleConfig
): Promise<Change> {
  const manifests = await manifestsOf(deps, machine.id);

  return {
    lines: moduleLines(deps.say, args.modules, config, manifests),
    subject: moduleSubject(args.modules, manifests),
  };
}

async function installModules(
  call: Call<"module_install">
): Promise<McpResult> {
  const { args, machine, deps } = call;
  const config = args.config ?? {};

  const secrets = await deps.secretFields(machine.id, args.modules);

  if (!secrets.ok) {
    return answered(secrets, deps);
  }

  const named = secretKeysIn(config, secrets.result);

  if (named.length > 0) {
    return refusal(
      `secret fields are never passed through MCP: ${named.join(", ")}. Leave them out; the owner fills them in the Pupitre app.`
    );
  }

  const check = await deps.check(machine.id, args.modules, config);

  if (!check.ok) {
    return answered(check, deps);
  }

  if (check.result.problems.length > 0) {
    return refusal(
      `the configuration is refused:\n${JSON.stringify(check.result.problems, null, 2)}`
    );
  }

  return await confirmed(
    "module_install",
    call,
    () => moduleChange(call, config),
    () => deps.install(machine.id, args.modules, config)
  );
}

async function detectProject({
  args,
  machine,
  deps,
}: Call<"project_detect">): Promise<McpResult> {
  const { dir, repo, branch } = args;

  if (Boolean(dir) === Boolean(repo)) {
    return refusal("name either repo (with an optional branch) or dir");
  }

  const params: ProjectDetectParams = dir
    ? { dir }
    : { repo: repo as string, ...(branch ? { branch } : {}) };

  return answered(await deps.detect(machine.id, params), deps);
}

function openedView(forward: PortForward) {
  return {
    address: `127.0.0.1:${forward.localPort}`,
    kept: forward.kept === true,
    local_port: forward.localPort,
    remote_port: forward.remotePort,
    server: forward.serverId,
    ...(forward.reconnecting ? { reconnecting: true } : {}),
  };
}

function forwardView(forward: PortForward, machines: readonly McpMachine[]) {
  return {
    ...openedView(forward),
    label: forward.label,
    server_name:
      machines.find((machine) => machine.id === forward.serverId)?.name ?? "",
  };
}

/** Named after the process that listens there, so the app's list of forwards reads like the project. */
async function forwardLabel(
  deps: McpToolDeps,
  serverId: string,
  port: number
): Promise<string> {
  const listed = await deps.projects(serverId);
  const projects = listed.ok ? listed.result.projects : [];

  for (const project of projects) {
    const process = project.processes.find(
      (candidate) =>
        candidate.port === port ||
        candidate.routes.some((route) => route.port === port)
    );

    if (process) {
      return `${project.name}/${process.id}`;
    }
  }

  return String(port);
}

async function openForwardFor({
  args,
  machine,
  deps,
}: Call<"forward_open">): Promise<McpResult> {
  const keep = args.keep === true;
  const opening: ForwardOptions =
    args.local_port === undefined
      ? { keep, preferRemote: true }
      : { keep, localPort: args.local_port };

  const opened = await deps.openForward(
    machine.id,
    args.port,
    opening,
    await forwardLabel(deps, machine.id, args.port)
  );

  if (!opened.ok) {
    return answered(opened, deps);
  }

  const forward = opened.result;

  if (!(await deps.listening(forward.localPort))) {
    if (!forward.kept) {
      deps.closeForward(forward.id);
    }

    return refusal(
      `the forward to port ${args.port} on ${machine.name} did not come up: the app's SSH connection to the machine failed. ` +
        `Call status on the ${machine.entry} MCP server to check that the machine answers.`
    );
  }

  return json(openedView(forward));
}

function closeForwardsTo({
  args,
  machine,
  deps,
}: Call<"forward_close">): Promise<McpResult> {
  const matching = deps
    .forwards()
    .filter(
      (forward) =>
        forward.serverId === machine.id && forward.remotePort === args.port
    );

  for (const forward of matching) {
    deps.closeForward(forward.id);
  }

  return Promise.resolve(
    text(
      `${matching.length} forward(s) to port ${args.port} on ${machine.name} closed.`
    )
  );
}

const RUNNERS: {
  [T in MachineTool]: (call: Call<T>) => Promise<McpResult>;
} = {
  catalog: async ({ machine, deps }) =>
    answered(await deps.catalog(machine.id), deps),
  forward_close: closeForwardsTo,
  forward_open: openForwardFor,
  module_install: installModules,
  module_uninstall: (call) =>
    confirmed(
      "module_uninstall",
      call,
      () => moduleChange(call, {}),
      () => call.deps.uninstall(call.machine.id, call.args.modules)
    ),
  project_add: (call) =>
    confirmed(
      "project_add",
      call,
      async () => ({
        lines: addLines(call.deps.say, call.args.project),
        subject: call.args.project.name,
      }),
      () => call.deps.addProject(call.machine.id, call.args.project)
    ),
  project_detect: detectProject,
  project_list: async ({ machine, deps }) =>
    answered(await deps.projects(machine.id), deps),
  project_remove: (call) =>
    confirmed(
      "project_remove",
      call,
      async () => ({
        lines: removeLines(
          call.deps.say,
          await heldProject(call.deps, call.machine.id, call.args.name)
        ),
        subject: call.args.name,
      }),
      () => call.deps.removeProject(call.machine.id, call.args.name)
    ),
  project_update: (call) => {
    const { server: _server, ...params } = call.args;

    return confirmed(
      "project_update",
      call,
      async () => ({
        lines: updateLines(
          call.deps.say,
          await heldProject(call.deps, call.machine.id, params.name),
          params.patch
        ),
        subject: params.name,
      }),
      () => call.deps.updateProject(call.machine.id, params)
    );
  },
};

async function runTool<T extends AppMcpTool>(
  tool: T,
  raw: unknown,
  deps: McpToolDeps
): Promise<McpResult> {
  const parsed = APP_MCP_TOOLS[tool].safeParse(raw);

  if (!parsed.success) {
    return refusal(`invalid arguments for ${tool}: ${parsed.error.message}`);
  }

  if (tool === "servers") {
    return json(deps.machines());
  }

  if (tool === "forward_list") {
    const machines = deps.machines();

    return json(
      deps.forwards().map((forward) => forwardView(forward, machines))
    );
  }

  const args = parsed.data as AppMcpArgs<MachineTool>;
  const machine = deps.machines().find((known) => known.id === args.server);

  if (!machine) {
    return refusal(
      `unknown server: ${args.server}. Call servers for the ids this app manages.`
    );
  }

  const run = RUNNERS[tool as MachineTool] as (
    call: Call<MachineTool>
  ) => Promise<McpResult>;

  return await run({ args, deps, machine });
}

export function appMcpTools(deps: McpToolDeps): McpTool[] {
  return (Object.keys(APP_MCP_TOOLS) as AppMcpTool[]).map((name) => {
    const changes = CONFIRMED_TOOLS.has(name) || LOCAL_TOOLS.has(name);

    return {
      annotations: {
        destructiveHint:
          name === "module_uninstall" || name === "project_remove",
        idempotentHint: !CONFIRMED_TOOLS.has(name),
        openWorldHint: false,
        readOnlyHint: !changes,
      },
      description: APP_MCP_TEXTS[name].description,
      inputSchema: contractJsonSchema(APP_MCP_TOOLS[name]),
      name,
      run: (args) => runTool(name, args, deps),
      title: APP_MCP_TEXTS[name].title,
    };
  });
}
