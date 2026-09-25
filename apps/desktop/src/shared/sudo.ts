import type { AgentError } from "@shared/agent";

/** `kept: false` is a password the app forgets on quitting, never written to the keychain. */
export interface SudoPasswordState {
  held: boolean;
  kept: boolean;
}

export type SudoOutcome =
  | { ok: true; kept: boolean }
  | { ok: false; error: AgentError };
