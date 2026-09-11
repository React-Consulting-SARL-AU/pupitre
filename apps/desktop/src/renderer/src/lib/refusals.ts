import type { AgentError } from "@shared/agent";

/**
 * A refusal that is not news.
 *
 * A server whose usage right the platform stopped confirming refuses every
 * command that reads its catalogue, its tunnel or its services, each with the
 * same sentence. The screen says it once, where it can be acted on; the ones
 * that follow are the consequence, and printing them stacks three red boxes
 * saying the same thing.
 */
export function heldForUsage(error: AgentError | null | undefined): boolean {
  return error?.code === "entitlement_required";
}
