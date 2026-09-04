import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { HardenResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentError } from "@shared/agent";

/**
 * What the hardening says about itself while it runs.
 *
 * The `step` events are the agent's own, passed on untouched. The other one
 * belongs to the app: rewriting its SSH configuration and reopening the channel
 * on the new account is work no agent can report on, since the session that
 * would report it is the one being replaced.
 */
export type HardenUpdate =
  | { kind: "event"; event: Event }
  | { kind: "switching"; user: string };

/**
 * The hardening, and what the app did with it.
 *
 * `harden` is the agent's answer as it stands, `reason` included. `user` is the
 * account the app connects with from now on, or nothing when it did not change:
 * a refused hardening leaves root open, and the app stays where it was.
 */
export type HardenOutcome = {
  harden: HardenResult;
  user: string | null;
  reconnected: boolean;
  /** Why the reconnection on the new account did not happen. */
  error?: AgentError;
};
