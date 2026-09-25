import type { AgentResponse } from "@shared/agent";

/** Never rejects: a main process older than its window may not know the channel. */
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
