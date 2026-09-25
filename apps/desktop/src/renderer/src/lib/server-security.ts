import type { SudoState } from "@pupitre/shared/agent-protocol/state";
import type { Server } from "@shared/servers";

export type SecuringNeed = "root" | "sudo";

/** Still on root: securing never finished; `nopasswd_all`: secured before sudo passwords (decision 0015). */
export function needsSecuring(
  server: Server | null,
  sudo?: SudoState
): SecuringNeed | null {
  if (server?.origin !== "app") {
    return null;
  }

  if (server.user === "root") {
    return "root";
  }

  return sudo === "nopasswd_all" ? "sudo" : null;
}
