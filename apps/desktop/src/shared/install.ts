import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { EnrollmentSummary } from "./account";

/** `secrets.held` is false once the agent took them; true when it refused first and the next Apply resends. */
export type InstallUpdate =
  | { kind: "sending"; arch: string }
  | { kind: "sent"; arch: string; bytes: number }
  | { kind: "event"; event: Event }
  | { kind: "secrets"; held: boolean };

/** `sha256` is the server's own, read back after the write. */
export interface AgentDelivery {
  arch: string;
  sha256: string;
  bytes: number;
  path: string;
  /** Null on a development build with no account. */
  enrollment?: EnrollmentSummary | null;
}

export type AgentSendPhase = "reading" | "enrolling" | "sending" | "starting";

export const AGENT_SEND_PHASES: readonly AgentSendPhase[] = [
  "reading",
  "enrolling",
  "sending",
  "starting",
];
