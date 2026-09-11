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
  /** The folder the agent registered for a project, the one its files are browsed from. */
  path?: (serverId: string, project: string) => string | null;
  /** The root of the server's files, the one a folder of the server view counts from. */
  root?: (serverId: string) => Promise<string | null>;
}

export interface TerminalCommand {
  kind: TerminalKind;
  command: string;
  session: string | null;
}

/** What the renderer names when it asks for a terminal: nothing here is trusted. */
export interface TerminalRequest {
  /** The tab, already read as a string by the channel that owns it. */
  id: string;
  serverId: unknown;
  kind: unknown;
  project: unknown;
  /** The session a remembered tab carries, or nothing for a tab that is new. */
  session: unknown;
  /** A folder under the project's — or under the server's root — the shell opens in. */
  dir?: unknown;
}

const FOLDER_OK = /^\/[\w.\-/+@]{0,240}$/;
/** A relative folder: no leading slash, no step above, the same alphabet as an absolute one. */
const SUBFOLDER_OK = /^[\w.\-/+@]{1,240}$/;
/** tmux refuses "." and ":" in a session name, and refuses an empty one. */
const SESSION_OK = /^[A-Za-z0-9_-]{1,80}$/;
const NOT_IN_SESSION = /[^A-Za-z0-9_-]+/g;
const NAME_PART = 32;

export function isSessionName(value: unknown): value is string {
  return typeof value === "string" && SESSION_OK.test(value);
}

/** A folder named by the renderer, kept under the one the app already trusts. */
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

/**
 * The tmux session a shell tab attaches to.
 *
 * The tab's own identifier is what makes it unique and stable: it is written
 * down with the tab, so the same tab asks for the same session at the next
 * launch and `-A` hands back the shell that kept running.
 */
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

/**
 * A shell under tmux, exactly as an agent runs.
 *
 * A closed lid, a Wi-Fi that drops or a window closed on macOS lets go of the
 * pipe; what was running keeps running, and `-A` attaches to it again instead of
 * starting a second one beside it.
 *
 * The status line is turned off on that session alone: tmux paints it green,
 * and the app draws its own bar under every terminal anyway. The separator is
 * quoted so the remote shell hands tmux a literal ";" instead of splitting the
 * line in two.
 */
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

/**
 * Where a shell starts: the project's folder, or a folder under it that the
 * renderer named, or one under the server's root when no project is named.
 * The base is always one the agent gave; the renderer only ever names the rest.
 */
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

/** A project the agent has not declared goes nowhere, and neither does its folder. */
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
