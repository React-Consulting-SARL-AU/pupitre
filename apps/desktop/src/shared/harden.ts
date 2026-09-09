import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { HardenResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentError } from "@shared/agent";

/**
 * What the hardening says about itself while it runs.
 *
 * The `step` events are the agent's own, passed on untouched. The other two
 * belong to the app: a command still waiting for the channel of a longer one,
 * and rewriting its SSH configuration to reopen on the new account — work no
 * agent can report on, since the session that would report it is the one being
 * replaced.
 */
export type HardenUpdate =
  | { kind: "event"; event: Event }
  | { kind: "queued" }
  | { kind: "switching"; user: string };

/**
 * The hardening, and what the app did with it.
 *
 * `harden` is the agent's answer as it stands, `reason` included. `user` is the
 * account the app connects with from now on, or nothing when it did not change:
 * a refused hardening leaves root open, and the app stays where it was.
 */
export interface HardenOutcome {
  harden: HardenResult;
  user: string | null;
  reconnected: boolean;
  /** Why the reconnection on the new account did not happen. */
  error?: AgentError;
}
