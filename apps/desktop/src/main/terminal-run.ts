import type { AgentKind } from "@pupitre/shared/agent-protocol/processes";
import { AGENT_KINDS } from "@pupitre/shared/agent-protocol/processes";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { TerminalKind } from "@shared/terminals";
import { TERMINAL_KINDS } from "@shared/terminals";
import type { AgentClient } from "./agent-client";

/**
 * What a terminal of the app runs on the other side, and who decides it.
 *
 * A shell is the app's own business: it logs in and moves to the folder the
 * agent named for the project. An agent tab is not — Claude, Codex and Hermes
 * are attached to a session the agent owns, so the command comes from
 * `agent.open` and the app never writes one of its own.
 */

export interface TerminalDeps {
  client: Pick<AgentClient, "request">;
  knows: (serverId: string) => boolean;
  declares: (serverId: string, project: string) => boolean;
  folder: (serverId: string, project: string) => string | null;
}

export interface TerminalCommand {
  kind: TerminalKind;
  command: string;
  session: string | null;
}

const FOLDER_OK = /^\/[\w.\-/+@]{0,240}$/;

function refuse(
  code: AgentError["code"],
  message: string,
  fix: string
): AgentResponse<never> {
  return { ok: false, error: { code, fix, message } };
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

function loginShell(dir: string | null): TerminalCommand {
  const cd = dir && FOLDER_OK.test(dir) ? `cd '${dir}' && ` : "";

  return { command: `${cd}exec $SHELL -l`, kind: "shell", session: null };
}

/**
 * The remote command of a terminal, or the refusal that explains itself.
 *
 * The renderer names a server, a kind and a project; a project the agent has
 * not declared goes nowhere, and a folder that is not an absolute path it gave
 * is dropped rather than quoted into a command.
 */
export async function terminalCommand(
  serverId: unknown,
  kind: unknown,
  project: unknown,
  deps: TerminalDeps
): Promise<AgentResponse<TerminalCommand>> {
  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return refuse(
      "bad_request",
      "Ce serveur n'est plus dans la liste.",
      "Choisis un serveur dans les réglages."
    );
  }

  if (!isTerminalKind(kind)) {
    return refuse(
      "bad_request",
      `Genre de terminal inconnu : ${String(kind)}.`,
      "Ouvre un terminal, ou l'onglet d'un agent installé."
    );
  }

  const named = typeof project === "string" ? project : null;

  if (named !== null && !deps.declares(serverId, named)) {
    return refuse(
      "project_not_found",
      `Ce serveur n'a pas déclaré de projet nommé ${named}.`,
      "Recharge la liste des projets, puis reprends."
    );
  }

  if (!isAgentKind(kind)) {
    return {
      ok: true,
      result: loginShell(named ? deps.folder(serverId, named) : null),
    };
  }

  if (named === null) {
    return refuse(
      "bad_request",
      "Un agent s'ouvre sur un projet.",
      "Ouvre l'agent depuis la page d'un projet."
    );
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
