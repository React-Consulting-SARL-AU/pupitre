import type { AgentResponse } from "@shared/agent";

/**
 * A call across the bridge that answers even when the main process throws or
 * does not know the channel — an app whose main process predates its window —
 * so that no gesture is left waiting on a promise that rejected.
 */
export async function bridged<T>(
  channel: string,
  call: () => Promise<AgentResponse<T>>
): Promise<AgentResponse<T>> {
  try {
    return await call();
  } catch (failure) {
    return {
      error: {
        code: "internal",
        message: failure instanceof Error ? failure.message : String(failure),
        phrase: { id: "refusal.bridge.failed", values: { channel } },
      },
      ok: false,
    };
  }
}
