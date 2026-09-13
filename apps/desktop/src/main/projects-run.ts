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
import type { AgentClient } from "./agent-client";
import { refuseWith } from "./refusal";

/**
 * The project commands, and what the renderer is allowed to say to them.
 *
 * The renderer describes a project once, when it is added, and names it after
 * that. A name it did not get from the agent goes nowhere: the list and the add
 * are the only two ways into the map below, and every other command is checked
 * against it before it becomes a request.
 */

const FOLLOW_MS = 1_800_000;

const DEFAULT_LINES = 200;

const BRANCH_OK = /^[\w.\-/]{1,120}$/;

export interface ProjectDeps {
  client: Pick<AgentClient, "request">;
  /** Whether this identifier still names a server of the app's configuration. */
  knows: (serverId: string) => boolean;
  /**
   * Removes the DNS record of a name a project no longer answers to — because
   * the project leaves, or because its configuration dropped the route. A name
   * left behind still answers, with nothing behind it anymore.
   */
  release?: (serverId: string, hostname: string) => Promise<unknown>;
}

/**
 * The projects the agent named, and the folders it named for each.
 *
 * `dir` is what the registry holds — relative to a projects root the protocol
 * never states. `path` is that same folder in absolute, resolved by the agent
 * for every project, versioned or not: it is where a terminal starts and what
 * an editor is pointed at. `root` is the root git reports, filled in the day a
 * git command answers, and it is the one the editor prefers on a repository
 * whose registry folder sits below it.
 */
interface Declared {
  dir: string;
  path: string | null;
  root: string | null;
  /** The names on the web the project answers to, as the agent stored them: what a removal or a rewrite has to hand back. */
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

/** The absolute folder of a project: git's root, else the one the agent gave. */
export function projectFolder(serverId: string, name: string): string | null {
  const held = declared.get(serverId)?.get(name);

  return held?.root ?? held?.path ?? null;
}

/** The folder the agent registered for a project: what its files are browsed from, git's root or not. */
export function projectPath(serverId: string, name: string): string | null {
  return declared.get(serverId)?.get(name)?.path ?? null;
}

/** Whether this server has declared a project under that name. */
export function declaresProject(serverId: string, name: string): boolean {
  return declared.get(serverId)?.has(name) ?? false;
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

function hostnamesOf(routes: readonly Route[] | undefined): string[] {
  return (routes ?? []).flatMap((route) => route.hostname ?? []);
}

/** The names the agent holds for a project, as it last answered them. */
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
    routes?: readonly Route[];
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
      hostnames: hostnamesOf(project.routes),
      path: absolute,
      root: known?.root ?? null,
    });
  }

  declared.set(serverId, held);
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
    parsed.data as ProjectAddParams
  );

  if (answer.ok) {
    remember(server, [answer.result]);
  }

  return answer;
}

/**
 * A project rewritten in place, and the names it stops answering to released.
 *
 * The agent replaces the routes and answers the project as it stands; the
 * records are the app's, so the names of before are read against the names of
 * after, and a name that went is dropped from the zone before the tunnel is
 * asked to sync. The renderer names a project the list gave it, never one it
 * made up, and the patch is held to the contract before it becomes a request.
 */
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

  const kept = new Set(hostnamesOf(answer.result.routes));

  if (deps.release) {
    for (const hostname of before) {
      if (!kept.has(hostname)) {
        await deps.release(call.serverId, hostname);
      }
    }
  }

  return answer;
}

/**
 * A server and a project name the agent itself has named, or nothing.
 *
 * The renderer never gets to invent a project: what it can drive is what the
 * list or the add came back with.
 */
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

/** The commands that take a project name and nothing else. */
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

/**
 * One project, one command, no parameter but its name.
 *
 * `project.git_status` goes out to the network — it asks the remote repository
 * what it has more of — so it is asked when a project opens and when the reader
 * asks again, never from a refresh loop.
 */
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

export function projectUrl(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectUrlResult>> {
  return onProject("project.url", serverId, name, deps);
}

export type ProjectAction = "project.up" | "project.down" | "project.restart";

const ACTIONS: readonly ProjectAction[] = [
  "project.up",
  "project.down",
  "project.restart",
];

/**
 * Start, stop or restart — one project, or every one of them.
 *
 * "all" is the agent's own word, not a name the renderer made up, so it is the
 * one target that does not go through the declared list.
 */
export async function actOnProject(
  action: unknown,
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectActionResult>> {
  if (!ACTIONS.includes(action as ProjectAction)) {
    return refuse("bad_request", "refusal.project.action.unknown", {
      action: String(action),
    });
  }

  const server = known(serverId, deps);

  if (name === "all") {
    return server
      ? await deps.client.request(server, action as ProjectAction, {
          name: "all",
        })
      : unknownServer();
  }

  const call = target(serverId, name, deps);

  return isRefusal(call)
    ? call
    : await deps.client.request(call.serverId, action as ProjectAction, {
        name: call.name,
      });
}

export function startProject(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectActionResult>> {
  return actOnProject("project.up", serverId, name, deps);
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

/**
 * One file's diff, as git printed it.
 *
 * The path is one the working tree just named; the agent checks it again on its
 * side, because a path is the one thing a renderer could still smuggle in.
 */
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

/**
 * The environment file of a project: its keys, never a value.
 *
 * Without `force` the agent reads the file it already wrote, or writes it once
 * from the project's template; with it, the file is written again from the
 * vault. Only the names of the keys come back, which is all a screen may show.
 */
export async function projectEnv(
  serverId: unknown,
  name: unknown,
  force: boolean,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectEnvResult>> {
  const call = target(serverId, name, deps);

  if (isRefusal(call)) {
    return call;
  }

  return await deps.client.request(call.serverId, "project.env", {
    name: call.name,
    ...(force ? { force: true } : {}),
  });
}

/**
 * The journal of a project, read once or followed.
 *
 * A followed journal holds its channel until the project stops, so it gets the
 * long timeout rather than the minute a read is given.
 */
export async function projectLogs(
  serverId: unknown,
  name: unknown,
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

  const count =
    typeof lines === "number" && lines > 0 ? Math.floor(lines) : DEFAULT_LINES;

  return await deps.client.request(
    call.serverId,
    "project.logs",
    { follow, lines: count, name: call.name },
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
