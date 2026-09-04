import type {
  ProjectActionResult,
  ProjectAddParams,
  ProjectAddResult,
  ProjectListResult,
  ProjectLogsResult,
  ProjectSyncResult,
  ProjectUrlResult,
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
 * are the only two ways into the set below, and every other command is checked
 * against it before it becomes a request.
 */

const FOLLOW_MS = 1_800_000;

const DEFAULT_LINES = 200;

export type ProjectDeps = {
  client: Pick<AgentClient, "request">;
  /** Whether this identifier still names a server of the app's configuration. */
  knows: (serverId: string) => boolean;
};

const declared = new Map<string, Set<string>>();

export function forgetProjects(serverId?: string): void {
  if (serverId) {
    declared.delete(serverId);
  } else {
    declared.clear();
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

function remember(serverId: string, names: readonly string[]): void {
  const held = declared.get(serverId) ?? new Set<string>();

  for (const name of names) {
    held.add(name);
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
    remember(
      server,
      answer.result.projects.map((project) => project.name)
    );
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
    remember(server, [answer.result.name]);
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

export async function syncProject(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectSyncResult>> {
  const call = target(serverId, name, deps);

  return isRefusal(call)
    ? call
    : await deps.client.request(call.serverId, "project.sync", {
        name: call.name,
      });
}

export async function installProject(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<DoneResult>> {
  const call = target(serverId, name, deps);

  return isRefusal(call)
    ? call
    : await deps.client.request(call.serverId, "project.install", {
        name: call.name,
      });
}

export async function startProject(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectActionResult>> {
  const call = target(serverId, name, deps);

  return isRefusal(call)
    ? call
    : await deps.client.request(call.serverId, "project.up", {
        name: call.name,
      });
}

export async function projectUrl(
  serverId: unknown,
  name: unknown,
  deps: ProjectDeps
): Promise<AgentResponse<ProjectUrlResult>> {
  const call = target(serverId, name, deps);

  return isRefusal(call)
    ? call
    : await deps.client.request(call.serverId, "project.url", {
        name: call.name,
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
