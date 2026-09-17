import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { EnrollmentSummary } from "./account";

/**
 * What the installation says about itself while it runs.
 *
 * The `step` events are the agent's own, passed on untouched. The others
 * belong to the app: putting `pupitred` on a machine that has none is work the
 * agent cannot report on, since it is not there yet — and a screen that stayed
 * blank for those eighteen megabytes would look frozen. `secrets` comes last
 * and says whether the vault still holds what the form typed: the agent took
 * them, and the form shows them as spent, or it refused before reading them,
 * and the next Apply carries them again.
 */
export type InstallUpdate =
  | { kind: "sending"; arch: string }
  | { kind: "sent"; arch: string; bytes: number }
  | { kind: "event"; event: Event }
  | { kind: "secrets"; held: boolean };

/**
 * What the app put on the machine before speaking to it: the binary, its size,
 * and where it landed. The checksum is the server's own, read back after the
 * write.
 */
export interface AgentDelivery {
  arch: string;
  sha256: string;
  bytes: number;
  path: string;
  /**
   * The server as the platform now knows it. Null on a development build with
   * no account, where the binary is the one the app carries.
   */
  enrollment?: EnrollmentSummary | null;
}

/**
 * Where the binary install stands, which the agent cannot report itself.
 *
 * `reading` re-reads the machine to know which architecture to send it,
 * `enrolling` asks the platform for its place and checks the version it names,
 * `sending` writes the megabytes onto the machine, `starting` gives the agent
 * the token it will introduce itself with. These are four different waits, and
 * the longest is not always the same one.
 */
export type AgentSendPhase = "reading" | "enrolling" | "sending" | "starting";

export const AGENT_SEND_PHASES: readonly AgentSendPhase[] = [
  "reading",
  "enrolling",
  "sending",
  "starting",
];
