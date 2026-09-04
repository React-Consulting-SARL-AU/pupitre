import type { ProtocolErrorCode } from "@pupitre/shared/agent-protocol/errors";

/**
 * What crosses IPC, on both sides of the bridge.
 *
 * The commands, their parameters and their results come from
 * `@pupitre/shared/agent-protocol` and are never redeclared here. What lives
 * here is the envelope itself, plus the two failures that belong to the channel
 * rather than to the agent: a command that never answered, and a link that
 * dropped.
 */
export type AgentErrorCode = ProtocolErrorCode | "timeout" | "disconnected";

export interface AgentError {
  code: AgentErrorCode;
  message: string;
  fix?: string;
}

export type AgentResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: AgentError };
