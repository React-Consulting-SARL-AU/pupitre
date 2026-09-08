import type {
  ProtocolErrorCode,
  Remedy,
} from "@pupitre/shared/agent-protocol/errors";

/**
 * What crosses IPC, on both sides of the bridge.
 *
 * The commands, their parameters and their results come from
 * `@pupitre/shared/agent-protocol` and are never redeclared here. What lives
 * here is the envelope itself, plus the failures that belong to the channel
 * rather than to the agent: a command that never answered, a link that dropped,
 * and the subscription this app refuses to act without — the agent has
 * `entitlement_required` for its own side of that rule, never this one.
 */
export type AgentErrorCode =
  | ProtocolErrorCode
  | "timeout"
  | "disconnected"
  | "server_suspended";

/**
 * What the app has to render itself, rather than show as is.
 *
 * A refusal from the main process names an entry of the renderer's dictionary
 * and the values to put in it; what comes from the agent carries none, and is
 * shown word for word, in the language the server answered in.
 */
export interface ErrorPhrase {
  id: string;
  values?: Record<string, string | number>;
}

export interface AgentError {
  code: AgentErrorCode;
  message: string;
  fix?: string;
  /** The machine-readable half of `fix`, when the remedy is a value. */
  remedy?: Remedy;
  phrase?: ErrorPhrase;
}

export type AgentResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: AgentError };
