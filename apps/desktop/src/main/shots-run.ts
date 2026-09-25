import type { AgentResponse } from "@shared/agent";
import { refuseWith } from "./refusal";

const MAX_SHOT_BYTES = 64 * 1024 * 1024;

/** The window may not name a place on disk: only a path the save dialog returned is written. */
export async function saveShot(
  path: unknown,
  bytes: unknown,
  deps: {
    picked: (path: unknown) => path is string;
    write: (path: string, bytes: Uint8Array) => Promise<void>;
  }
): Promise<AgentResponse<{ path: string }>> {
  if (!deps.picked(path)) {
    return refuseWith("bad_request", "refusal.shots.savePath");
  }

  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return refuseWith("bad_request", "refusal.shots.saveBytes");
  }

  if (bytes.byteLength > MAX_SHOT_BYTES) {
    return refuseWith("bad_request", "refusal.shots.saveBytes");
  }

  try {
    await deps.write(path, bytes);
  } catch (failure) {
    return refuseWith("internal", "refusal.shots.saveFailed", {
      path,
      reason: failure instanceof Error ? failure.message : String(failure),
    });
  }

  return { ok: true, result: { path } };
}
