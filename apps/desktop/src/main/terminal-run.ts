import type { AgentKind } from "@pupitre/shared/agent-protocol/processes";
import { AGENT_KINDS } from "@pupitre/shared/agent-protocol/processes";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { TerminalKind } from "@shared/terminals";
import { TERMINAL_KINDS } from "@shared/terminals";
import type { AgentClient } from "./agent-client";

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

/** A project the agent has not declared goes nowhere, and neither does its folder. */
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
