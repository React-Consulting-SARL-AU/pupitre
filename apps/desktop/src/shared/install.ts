import type { Event } from "@pupitre/shared/agent-protocol/envelope";

/**
 * What the installation says about itself while it runs.
 *
 * The `step` events are the agent's own, passed on untouched. The other two
 * belong to the app: putting `pupitred` on a machine that has none is work the
 * agent cannot report on, since it is not there yet — and a screen that stayed
 * blank for those eighteen megabytes would look frozen.
 */
export type InstallUpdate =
  | { kind: "sending"; arch: string }
  | { kind: "sent"; arch: string; bytes: number }
  | { kind: "event"; event: Event };

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
}
