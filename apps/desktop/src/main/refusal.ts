import type { AgentError, AgentErrorCode, AgentResponse } from "@shared/agent";

/**
 * A refusal from the main process, named rather than written.
 *
 * Nothing the app shows is worded here: the refusal carries the id of a
 * renderer dictionary entry and the values to put in it, and the screen renders
 * it, in the language of whoever is looking. What comes from the agent is shown
 * as is.
 */
export function refusalOf(
  code: AgentErrorCode,
  id: string,
  values?: Record<string, string | number>
): AgentError {
  return {
    code,
    message: id,
    phrase: values ? { id, values } : { id },
  };
}

export function refuseWith(
  code: AgentErrorCode,
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return { ok: false, error: refusalOf(code, id, values) };
}
