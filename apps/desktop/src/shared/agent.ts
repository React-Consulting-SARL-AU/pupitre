import type {
  ProtocolErrorCode,
  Remedy,
} from "@pupitre/shared/agent-protocol/errors";

/** Failures of the channel rather than of the agent, which has its own `license_required`. */
export type AgentErrorCode =
  | ProtocolErrorCode
  | "timeout"
  | "disconnected"
  | "cancelled"
  | "server_suspended";

/** Only the main process's refusals carry one; the agent's are shown word for word, in its language. */
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
