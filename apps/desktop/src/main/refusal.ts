import type { AgentError, AgentErrorCode, AgentResponse } from "@shared/agent";

/** An i18n id, not prose: the renderer words it in the reader's language. */
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
