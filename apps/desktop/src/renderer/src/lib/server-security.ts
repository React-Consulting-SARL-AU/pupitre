import type { SudoState } from "@pupitre/shared/agent-protocol/state";
import type { Server } from "@shared/servers";

export type SecuringNeed = "root" | "sudo";

/**
 * What the securing still owes a server of the app. A securing that went
 * through moves the app off root, and gives `dev` a sudo password (decision
 * 0015): one still on root never finished, and one whose agent still reports
 * `nopasswd_all` was secured before passwords existed.
 */
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
