import type { AgentError } from "./agent";

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
  name: string;
  /** Relative to the agent's root, as `fs.*` names it. */
  remotePath: string;
  /** Always what a dialog or a drop designated, never a renderer-made path. */
  localPath: string;
  tool: TransferTool;
  status: TransferStatus;
  done: number;
  total: number | null;
  rate: number | null;
  remaining: number | null;
  attempt: number;
  error: AgentError | null;
  startedAt: number;
  endedAt: number | null;
}

/** A call's answer can overtake an earlier event: the higher revision wins, so no transfer goes backwards. */
export interface TransferList {
  revision: number;
  transfers: Transfer[];
}

export function settled(transfer: Pick<Transfer, "status">): boolean {
  return !UNSETTLED.includes(transfer.status);
}
