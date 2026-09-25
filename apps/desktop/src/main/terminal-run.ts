import type { AgentKind } from "@pupitre/shared/agent-protocol/processes";
import { AGENT_KINDS } from "@pupitre/shared/agent-protocol/processes";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { TerminalKind } from "@shared/terminals";
import { TERMINAL_KINDS } from "@shared/terminals";
import type { AgentClient } from "./agent-client";
import { refuseWith } from "./refusal";

export interface TerminalDeps {
  client: Pick<AgentClient, "request">;
  knows: (serverId: string) => boolean;
  declares: (serverId: string, project: string) => boolean;
  folder: (serverId: string, project: string) => string | null;
  path?: (serverId: string, project: string) => string | null;
  root?: (serverId: string) => Promise<string | null>;
}

export interface TerminalCommand {
  kind: TerminalKind;
  command: string;
  session: string | null;
}

/** Named by the renderer: nothing here is trusted. */
export interface TerminalRequest {
  id: string;
  serverId: unknown;
  kind: unknown;
  project: unknown;
  session: unknown;
  dir?: unknown;
}

const FOLDER_OK = /^\/[\w.\-/+@]{0,240}$/;
const SUBFOLDER_OK = /^[\w.\-/+@]{1,240}$/;
/** tmux refuses "." and ":" in a session name, and refuses an empty one. */
const SESSION_OK = /^[A-Za-z0-9_-]{1,80}$/;
const NOT_IN_SESSION = /[^A-Za-z0-9_-]+/g;
const NAME_PART = 32;

export function isSessionName(value: unknown): value is string {
  return typeof value === "string" && SESSION_OK.test(value);
}

export function isSubfolder(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SUBFOLDER_OK.test(value) &&
    !value.split("/").some((part) => part === ".." || part === "")
  );
}

function joined(base: string | null, dir: string): string | null {
  return base && FOLDER_OK.test(base) ? `${base}/${dir}` : null;
}

function part(value: string, fallback: string): string {
  return value.replace(NOT_IN_SESSION, "-").slice(0, NAME_PART) || fallback;
}

/** The tab id is persisted, so the same tab reattaches with `-A` to the shell that kept running. */
function shellSession(project: string | null, id: string): string {
  return `shell-${part(project ?? "server", "server")}-${part(id, "tab")}`;
}

function refuse(
  code: AgentError["code"],
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith(code, id, values);
}

export function isTerminalKind(value: unknown): value is TerminalKind {
  return (
    typeof value === "string" &&
    (TERMINAL_KINDS as readonly string[]).includes(value)
  );
}

export function isAgentKind(kind: TerminalKind): kind is AgentKind {
  return (AGENT_KINDS as readonly string[]).includes(kind);
}

/** Status line off on this session only: the app draws its own bar under every terminal. */
function loginShell(session: string, dir: string | null): TerminalCommand {
  const where = dir && FOLDER_OK.test(dir) ? ["-c", dir] : [];

  return {
    command: [
      "tmux",
      "new-session",
      "-A",
      "-s",
      session,
      ...where,
      // Quoted so the remote shell hands tmux a literal ";" instead of splitting the line.
      "';'",
      "set-option",
      "-t",
      session,
      "status",
      "off",
    ].join(" "),
    kind: "shell",
    session,
  };
}

/** The base is always one the agent gave; the renderer only ever names the rest. */
async function startFolder(
  serverId: string,
  project: string | null,
  dir: string | null,
  deps: TerminalDeps
): Promise<string | null> {
  if (dir === null) {
    return project ? deps.folder(serverId, project) : null;
  }

  if (project) {
    return joined(deps.path?.(serverId, project) ?? null, dir);
  }

  return joined((await deps.root?.(serverId)) ?? null, dir);
}

export async function terminalCommand(
  request: TerminalRequest,
  deps: TerminalDeps
): Promise<AgentResponse<TerminalCommand>> {
  const { id, kind, project, serverId } = request;

  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return refuse("bad_request", "refusal.server.unknown");
  }

  if (!isTerminalKind(kind)) {
    return refuse("bad_request", "refusal.terminal.kind", {
      kind: String(kind),
    });
  }

  const remembered = request.session ?? null;

  if (remembered !== null && !isSessionName(remembered)) {
    return refuse("bad_request", "refusal.terminal.session", {
      session: String(remembered),
    });
  }

  const named = typeof project === "string" ? project : null;

  if (named !== null && !deps.declares(serverId, named)) {
    return refuse("project_not_found", "refusal.project.unknown", {
      name: named,
    });
  }

  const dir = request.dir ?? null;

  if (dir !== null && !isSubfolder(dir)) {
    return refuse("bad_request", "refusal.terminal.folder", {
      dir: String(dir),
    });
  }

  if (!isAgentKind(kind)) {
    const folder = await startFolder(serverId, named, dir, deps);

    if (dir !== null && folder === null) {
      return refuse("bad_request", "refusal.terminal.folder", { dir });
    }

    return {
      ok: true,
      result: loginShell(remembered ?? shellSession(named, id), folder),
    };
  }

  if (named === null) {
    return refuse("bad_request", "refusal.agent.project");
  }

  const answer = await deps.client.request(serverId, "agent.open", {
    kind,
    project: named,
  });

  return answer.ok
    ? {
        ok: true,
        result: {
          command: answer.result.command,
          kind,
          session: answer.result.session,
        },
      }
    : answer;
}
