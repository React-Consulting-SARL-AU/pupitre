import type { AgentResponse } from "@shared/agent";

/** One command to the agent of a server, typed by what the caller expects back. */
export function agentCall<T>(
  serverId: string,
  cmd: Parameters<Window["pupitre"]["agentCall"]>[1],
  params?: unknown
): Promise<AgentResponse<T>> {
  return window.pupitre.agentCall(serverId, cmd, params) as Promise<
    AgentResponse<T>
  >;
}
