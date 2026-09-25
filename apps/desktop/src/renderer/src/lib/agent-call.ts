import type { AgentResponse } from "@shared/agent";

export function agentCall<T>(
  serverId: string,
  cmd: Parameters<Window["pupitre"]["agentCall"]>[1],
  params?: unknown
): Promise<AgentResponse<T>> {
  return window.pupitre.agentCall(serverId, cmd, params) as Promise<
    AgentResponse<T>
  >;
}

/** Rides the beat channel, for reads a screen repeats on a timer. */
export function agentPoll<T>(
  serverId: string,
  cmd: Parameters<Window["pupitre"]["agentPoll"]>[1],
  params?: unknown
): Promise<AgentResponse<T>> {
  return window.pupitre.agentPoll(serverId, cmd, params) as Promise<
    AgentResponse<T>
  >;
}
