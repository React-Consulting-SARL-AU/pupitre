import type {
  ProjectActionResult,
  ProjectAddParams,
  ProjectAddResult,
  ProjectBranchesResult,
  ProjectCheckoutResult,
  ProjectDiffResult,
  ProjectEnvResult,
  ProjectGitStatusResult,
  ProjectInstallResult,
  ProjectListResult,
  ProjectLogsResult,
  ProjectPullResult,
  ProjectRemoveResult,
  ProjectSyncResult,
  ProjectUpdateParams,
  ProjectUpdateResult,
  ProjectUrlResult,
  ProjectWorkingTreeResult,
} from "@pupitre/shared/agent-protocol/projects";
import {
  ProjectAddParamsSchema,
  ProjectUpdateParamsSchema,
} from "@pupitre/shared/agent-protocol/projects";
import type { Route } from "@pupitre/shared/agent-protocol/state";
import type { AgentError, AgentResponse } from "@shared/agent";
import { PROJECT_ACTIONS, type ProjectAction } from "@shared/projects";
import type { AgentClient } from "./agent-client";
import { refuseWith } from "./refusal";

const FOLLOW_MS = 1_800_000;

const DEFAULT_LINES = 200;

const BRANCH_OK = /^[\w.\-/]{1,120}$/;

const PROCESS_OK = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface ProjectDeps {
  client: Pick<AgentClient, "request">;
  knows: (serverId: string) => boolean;
  /** A DNS record left behind a dropped route still answers, with nothing behind it anymore. */
  release?: (serverId: string, hostname: string) => Promise<unknown>;
}

interface Declared {
  /** Relative to a projects root the protocol never states. */
  dir: string;
  path: string | null;
  /** Git's root, preferred by the editor when the registry folder sits below it. */
  root: string | null;
  hostnames: readonly string[];
}

const declared = new Map<string, Map<string, Declared>>();

export function forgetProjects(serverId?: string): void {
  if (serverId) {
    declared.delete(serverId);
  } else {
    declared.clear();
  }
}

export function projectFolder(serverId: string, name: string): string | null {
  const held = declared.get(serverId)?.get(name);

  return held?.root ?? held?.path ?? null;
}

export function projectPath(serverId: string, name: string): string | null {
  return declared.get(serverId)?.get(name)?.path ?? null;
}

export function declaresProject(serverId: string, name: string): boolean {
  return declared.get(serverId)?.has(name) ?? false;
}

const UNSAFE_PATH = /[\0\r\n]/;

function climbs(path: string): boolean {
  return path.split("/").some((segment) => segment === "..");
}

/** A renderer path opens only when the agent named it or it sits under the root its completions count from. */
export function editorFolder(
  serverId: string,
  path: unknown,
  root: string | null
): string | null {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    UNSAFE_PATH.test(path) ||
    climbs(path)
  ) {
    return null;
  }

  const named = [...(declared.get(serverId)?.values() ?? [])].some(
    (held) => held.path === path || held.root === path
  );

  if (named) {
    return path;
  }

  return root && (path === root || path.startsWith(`${root}/`)) ? path : null;
}

const ABSOLUTE = /^\/[\w.\-/+@]{0,240}$/;

function noteRoot(serverId: string, name: string, root: unknown): void {
  const held = declared.get(serverId)?.get(name);

  if (held && typeof root === "string" && ABSOLUTE.test(root)) {
    held.root = root;
  }
}

function refuse(
  code: AgentError["code"],
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith(code, id, values);
}

function unknownServer(): AgentResponse<never> {
  return refuse("bad_request", "refusal.server.unknown");
}

function known(serverId: unknown, deps: ProjectDeps): string | null {
  return typeof serverId === "string" && deps.knows(serverId) ? serverId : null;
}

function hostnamesOf(
  processes: readonly { routes?: readonly Route[] }[] | undefined
): string[] {
  return (processes ?? []).flatMap((process) =>
    (process.routes ?? []).flatMap((route) => route.hostname ?? [])
  );
}

export function projectHostnames(
  serverId: string,
  name: string
): readonly string[] {
  return declared.get(serverId)?.get(name)?.hostnames ?? [];
}

function remember(
  serverId: string,
  projects: readonly {
    name: string;
    dir: string;
    path?: string;
    processes?: readonly { routes?: readonly Route[] }[];
  }[]
): void {
  const held = declared.get(serverId) ?? new Map<string, Declared>();

  for (const project of projects) {
    const known = held.get(project.name);
    const absolute =
      typeof project.path === "string" && ABSOLUTE.test(project.path)
        ? project.path
        : (known?.path ?? null);

    held.set(project.name, {
      dir: project.dir,
      hostnames: hostnamesOf(project.processes),
      path: absolute,
      root: known?.root ?? null,
    });
  }

  declared.set(serverId, held);
}

const LISTINGS: ReadonlySet<string> = new Set([
  "snapshot",
  "status",
  "project.list",
]);

/** A project opened after a launch may never go through `project.list`: a `snapshot` also names projects. */
export function noteProjects(
  serverId: string,
  cmd: string,
  answer: AgentResponse<unknown>
): void {
  if (!(answer.ok && LISTINGS.has(cmd))) {
    return;
  }

  const projects = (answer.result as { projects?: unknown }).projects;

  if (Array.isArray(projects) && projects.every(isNamed)) {
    remember(serverId, projects);
  }
}

function isNamed(value: unknown): value is { name: string; dir: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { dir?: unknown }).dir === "string"
  );
}

export async function listProjects(
  serverId: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectListResult>> {
  const server = known(serverId, deps);

  if (!server) {
    return unknownServer();
  }

  const answer = await deps.client.request(server, "project.list");

  if (answer.ok) {
    remember(server, answer.result.projects);
  }

  return answer;
}

export async function addProject(
  serverId: unknown,
  params: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectAddResult>> {
  const server = known(serverId, deps);

  if (!server) {
    return unknownServer();
  }

  const parsed = ProjectAddParamsSchema.safeParse(params);

  if (!parsed.success) {
    return refuse("bad_request", "refusal.project.unreadable");
  }

  const answer = await deps.client.request(
    server,
    "project.add",
    withoutDefaults(parsed.data) as ProjectAddParams
  );

  if (answer.ok) {
    remember(server, [answer.result]);
  }

  return answer;
}

/** The agent's params are closed: an agent from before `boot` or `runtimes` refuses a key it never learnt. */
function withoutDefaults(params: ProjectAddParams): Partial<ProjectAddParams> {
  const { boot, runtimes, ...rest } = params;

  return {
    ...rest,
    ...(boot ? { boot } : {}),
    ...(runtimes && Object.keys(runtimes).length > 0 ? { runtimes } : {}),
  };
}

/** The DNS records are the app's, not the agent's: a hostname the update dropped is released here. */
export async function updateProject(
  serverId: unknown,
  params: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectUpdateResult>> {
  const parsed = ProjectUpdateParamsSchema.safeParse(params);

  if (!parsed.success) {
    return refuse("bad_request", "refusal.project.unreadable");
  }

  const call = target(serverId, parsed.data.name, deps);

  if (isRefusal(call)) {
    return call;
  }

  const before = projectHostnames(call.serverId, call.name);
  const answer = await deps.client.request(
    call.serverId,
    "project.update",
    parsed.data as ProjectUpdateParams
  );

  if (!answer.ok) {
    return answer;
  }

  remember(call.serverId, [answer.result]);

  const kept = new Set(hostnamesOf(answer.result.processes));

  if (deps.release) {
    for (const hostname of before) {
      if (!kept.has(hostname)) {
        await deps.release(call.serverId, hostname);
      }
    }
  }

  return answer;
}

/** The renderer never invents a project: it drives only what the agent's list or add came back with. */
function target(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): { serverId: string; name: string } | AgentResponse<never> {
  const server = known(serverId, deps);

  if (!server) {
    return unknownServer();
  }

  if (typeof name !== "string" || !declared.get(server)?.has(name)) {
    return refuse("project_not_found", "refusal.project.unknown", {
      name: String(name),
    });
  }

  return { name, serverId: server };
}

function isRefusal(
  value: ReturnType<typeof target>
): value is AgentResponse<never> {
  return "ok" in value;
}

export type PlainProjectCommand =
  | "project.install"
  | "project.pull"
  | "project.sync"
  | "project.url"
  | "project.branches"
  | "project.git_status"
  | "project.working_tree"
  | "project.remove";

interface PlainResult {
  "project.install": ProjectInstallResult;
  "project.pull": ProjectPullResult;
  "project.sync": ProjectSyncResult;
  "project.url": ProjectUrlResult;
  "project.branches": ProjectBranchesResult;
  "project.git_status": ProjectGitStatusResult;
  "project.working_tree": ProjectWorkingTreeResult;
  "project.remove": ProjectRemoveResult;
}

/** `project.git_status` reaches the remote repository: callers ask it on open or on demand, never in a loop. */
export async function onProject<C extends PlainProjectCommand>(
  cmd: C,
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<PlainResult[C]>> {
  const call = target(serverId, name, deps);

  if (isRefusal(call)) {
    return call;
  }

  const answer = await deps.client.request(call.serverId, cmd, {
    name: call.name,
  } as never);

  if (answer.ok) {
    if (cmd === "project.remove") {
      const hostnames = projectHostnames(call.serverId, call.name);

      declared.get(call.serverId)?.delete(call.name);

      if (deps.release) {
        for (const hostname of hostnames) {
          await deps.release(call.serverId, hostname);
        }
      }
    } else {
      noteRoot(
        call.serverId,
        call.name,
        (answer.result as { root?: unknown }).root
      );
    }
  }

  return answer as AgentResponse<PlainResult[C]>;
}

export function pullProject(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectPullResult>> {
  return onProject("project.pull", serverId, name, deps);
}

export function syncProject(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectSyncResult>> {
  return onProject("project.sync", serverId, name, deps);
}

export function installProject(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectInstallResult>> {
  return onProject("project.install", serverId, name, deps);
}

function processOf(process: unknown): string | null {
  return typeof process === "string" && PROCESS_OK.test(process)
    ? process
    : null;
}

function isProjectAction(action: unknown): action is ProjectAction {
  return PROJECT_ACTIONS.includes(action as ProjectAction);
}

/** "all" is the agent's own word, so it is the one target that skips the declared list. */
export async function actOnProject(
  action: unknown,
  serverId: unknown,
  name: unknown,
  process: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectActionResult>> {
  if (!isProjectAction(action)) {
    return refuse("bad_request", "refusal.project.action.unknown", {
      action: String(action),
    });
  }

  const server = known(serverId, deps);

  if (name === "all") {
    return server
      ? await deps.client.request(server, action, {
          name: "all",
        })
      : unknownServer();
  }

  const call = target(serverId, name, deps);
  const scoped = processOf(process);

  return isRefusal(call)
    ? call
    : await deps.client.request(call.serverId, action, {
        name: call.name,
        ...(scoped ? { process: scoped } : {}),
      });
}

export function startProject(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectActionResult>> {
  return actOnProject("project.up", serverId, name, null, deps);
}

export async function checkoutProject(
  serverId: unknown,
  name: unknown,
  branch: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectCheckoutResult>> {
  const call = target(serverId, name, deps);

  if (isRefusal(call)) {
    return call;
  }

  if (typeof branch !== "string" || !BRANCH_OK.test(branch)) {
    return refuse("bad_request", "refusal.branch.unknown", {
      branch: String(branch),
    });
  }

  return await deps.client.request(call.serverId, "project.checkout", {
    branch,
    name: call.name,
  });
}

/** Only checked for presence here: the agent validates the path again, the one thing a renderer could smuggle. */
export async function diffProject(
  serverId: unknown,
  name: unknown,
  path: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectDiffResult>> {
  const call = target(serverId, name, deps);

  if (isRefusal(call)) {
    return call;
  }

  if (typeof path !== "string" || path.length === 0) {
    return refuse("bad_request", "refusal.file.none");
  }

  return await deps.client.request(call.serverId, "project.diff", {
    name: call.name,
    path,
  });
}

/** Only key names come back, never a value; `force` rewrites the file from the vault. */
export async function projectEnv(
  serverId: unknown,
  name: unknown,
  force: boolean,
  process: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectEnvResult>> {
  const call = target(serverId, name, deps);

  if (isRefusal(call)) {
    return call;
  }

  const scoped = processOf(process);

  return await deps.client.request(call.serverId, "project.env", {
    name: call.name,
    ...(force ? { force: true } : {}),
    ...(scoped ? { process: scoped } : {}),
  });
}

/** A followed journal holds its channel until the process stops, hence the long timeout. */
export async function projectLogs(
  serverId: unknown,
  name: unknown,
  process: unknown,
  lines: unknown,
  follow: boolean,
  onLine: (line: string) => void,
  deps: ProjectDeps,
  signal?: AbortSignal
): Promise<AgentResponse<ProjectLogsResult>> {
  const call = target(serverId, name, deps);

  if (isRefusal(call)) {
    return call;
  }

  const scoped = processOf(process);

  if (!scoped) {
    return refuse("bad_request", "refusal.project.process.unknown", {
      process: String(process),
    });
  }

  const count =
    typeof lines === "number" && lines > 0 ? Math.floor(lines) : DEFAULT_LINES;

  return await deps.client.request(
    call.serverId,
    "project.logs",
    { follow, lines: count, name: call.name, process: scoped },
    {
      onEvent: (event) => {
        const line = (event as { line?: unknown }).line;

        if (event.event === "log" && typeof line === "string") {
          onLine(line);
        }
      },
      ...(follow ? { timeoutMs: FOLLOW_MS } : {}),
      ...(signal ? { signal } : {}),
    }
  );
}
