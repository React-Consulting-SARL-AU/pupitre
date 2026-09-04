import type {
  ProjectActionResult,
  ProjectAddParams,
  ProjectAddResult,
  ProjectBranchesResult,
  ProjectCheckoutResult,
  ProjectDiffResult,
  ProjectGitStatusResult,
  ProjectListResult,
  ProjectLogsResult,
  ProjectRemoveResult,
  ProjectSyncResult,
  ProjectUrlResult,
  ProjectWorkingTreeResult,
} from "@pupitre/shared/agent-protocol/projects";
import { ProjectAddParamsSchema } from "@pupitre/shared/agent-protocol/projects";
import type { DoneResult } from "@pupitre/shared/agent-protocol/system";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { AgentClient } from "./agent-client";

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
}

/**
 * The projects the agent named, and the folder it named for each.
 *
 * `dir` is what the registry holds — relative to a projects root the protocol
 * never states. `root` is the absolute folder git reports, which is the only
 * absolute path the agent gives, and the one an editor or a terminal can be
 * pointed at. It is filled in the day a git command answers for that project.
 */
interface Declared {
  dir: string;
  root: string | null;
}

const declared = new Map<string, Map<string, Declared>>();

export function forgetProjects(serverId?: string): void {
  if (serverId) {
    declared.delete(serverId);
  } else {
    declared.clear();
  }
}

/** The absolute folder of a project, or nothing while git has not said. */
export function projectFolder(serverId: string, name: string): string | null {
  return declared.get(serverId)?.get(name)?.root ?? null;
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
  message: string,
  fix: string
): AgentResponse<never> {
  return { ok: false, error: { code, fix, message } };
}

function unknownServer(): AgentResponse<never> {
  return refuse(
    "bad_request",
    "Ce serveur n'est plus dans la liste.",
    "Choisis un serveur dans les réglages."
  );
}

function known(serverId: unknown, deps: ProjectDeps): string | null {
  return typeof serverId === "string" && deps.knows(serverId) ? serverId : null;
}

function remember(
  serverId: string,
  projects: readonly { name: string; dir: string }[]
): void {
  const held = declared.get(serverId) ?? new Map<string, Declared>();

  for (const project of projects) {
    const known = held.get(project.name);

    held.set(project.name, {
      dir: project.dir,
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
    return refuse(
      "bad_request",
      "La description du projet est incomplète.",
      parsed.error.issues[0]?.message ?? "Reprends le formulaire."
    );
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
    return refuse(
      "project_not_found",
      `Ce serveur n'a pas déclaré de projet nommé ${String(name)}.`,
      "Recharge la liste des projets, puis reprends."
    );
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
  | "project.sync"
  | "project.url"
  | "project.branches"
  | "project.git_status"
  | "project.working_tree"
  | "project.remove";

interface PlainResult {
  "project.install": DoneResult;
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
      declared.get(call.serverId)?.delete(call.name);
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
): Promise<AgentResponse<DoneResult>> {
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
    return refuse(
      "bad_request",
      `Action inconnue : ${String(action)}.`,
      "Choisis démarrer, arrêter ou redémarrer."
    );
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
    return refuse(
      "bad_request",
      `Nom de branche invalide : ${String(branch)}.`,
      "Choisis une branche dans la liste que le serveur a donnée."
    );
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
    return refuse(
      "bad_request",
      "Aucun fichier n'a été désigné.",
      "Choisis un fichier de l'arbre de travail."
    );
  }

  return await deps.client.request(call.serverId, "project.diff", {
    name: call.name,
    path,
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
  deps: ProjectDeps
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
    }
  );
}
