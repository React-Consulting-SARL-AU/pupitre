import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { HardenResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentError } from "@shared/agent";
import type { SudoOutcome } from "@shared/sudo";

/** `switching` is the app's own: the session that would report it is the one being replaced. */
export type HardenUpdate =
  | { kind: "event"; event: Event }
  | { kind: "queued" }
  | { kind: "switching"; user: string };

export interface HardenOutcome {
  harden: HardenResult;
  /** Null when the account did not change: a refused hardening leaves root open. */
  user: string | null;
  reconnected: boolean;
  /** Why reconnecting on the new account failed. */
  error?: AgentError;
  sudo?: SudoOutcome;
}
