import type { AgentError } from "@shared/agent";

/**
 * Whether this computer holds a server's sudo password, and whether the
 * keychain does: `kept: false` is a password the app forgets on quitting.
 */
export interface SudoPasswordState {
  held: boolean;
  kept: boolean;
}

/** The password the securing set on the server, or why it did not. */
export type SudoOutcome =
  | { ok: true; kept: boolean }
  | { ok: false; error: AgentError };
