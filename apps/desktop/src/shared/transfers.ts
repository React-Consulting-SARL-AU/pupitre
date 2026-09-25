import type { AgentError } from "./agent";

/**
 * A file on its way between this computer and a server, outside the agent's
 * channel.
 *
 * The channel carries lines of JSON capped at a few megabytes, all of them in
 * memory: a dump of several gigabytes is not a line. A transfer is its own
 * `rsync` — or `scp` where `rsync` is missing — on the app's own SSH
 * configuration, followed here by what its progress output says. Nothing of
 * the machine crosses with it: the renderer names a server and a path under
 * the agent's root, and the main process composes the rest.
 */

export type TransferDirection = "upload" | "download";

export type TransferKind = "file" | "dir";

/** `rsync` resumes where it stopped; `scp` starts over and is checked whole. */
export type TransferTool = "rsync" | "scp";

export type TransferStatus =
  | "queued"
  | "running"
  | "paused"
  | "done"
  | "failed"
  | "cancelled";

/** The states a transfer can still leave: what the app keeps across a launch. */
export const UNSETTLED: readonly TransferStatus[] = [
  "queued",
  "running",
  "paused",
];

export interface Transfer {
  id: string;
  serverId: string;
  direction: TransferDirection;
  kind: TransferKind;
  /** The entry's own name, what the panel shows. */
  name: string;
  /** Relative to the agent's root, as `fs.*` names it. */
  remotePath: string;
  /** Absolute on this computer, and always what a dialog or a drop designated. */
  localPath: string;
  tool: TransferTool;
  status: TransferStatus;
  /** Bytes already on the other side. */
  done: number;
  /** Bytes to move, when known before the end. */
  total: number | null;
  /** Bytes per second, as the last progress line said. */
  rate: number | null;
  /** Seconds left, as the last progress line said. */
  remaining: number | null;
  /** How many times the transfer was started, retries included. */
  attempt: number;
  error: AgentError | null;
  startedAt: number;
  endedAt: number | null;
}

/**
 * What the renderer is told, whole every time.
 *
 * The list travels with a counter: the answer of a call can overtake an event
 * sent just before it, and a reader that took the older one last would draw a
 * transfer going backwards. Whoever holds the higher revision holds the truth.
 */
export interface TransferList {
  revision: number;
  transfers: Transfer[];
}

export function settled(transfer: Pick<Transfer, "status">): boolean {
  return !UNSETTLED.includes(transfer.status);
}
