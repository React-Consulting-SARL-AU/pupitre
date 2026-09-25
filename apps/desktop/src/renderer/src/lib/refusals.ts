import type { AgentError } from "@shared/agent";

/** Every command repeats this refusal; the shell's notice already says it once. */
export function heldForUsage(error: AgentError | null | undefined): boolean {
  return error?.code === "entitlement_required";
}

export function unlessHeld(error: AgentError | null): AgentError | null {
  return heldForUsage(error) ? null : error;
}
