import type { PendingKeyApproval } from "@pupitre/shared/keys";
import type { KeyApprovalReceipt as SharedKeyApprovalReceipt } from "@pupitre/shared/platform-api/account";

export type KeyApprovalReceipt = SharedKeyApprovalReceipt;

/** One pending key, named the way the renderer asks for it: a server and a device. */
export function approvalKeyOf(
  approval: Pick<PendingKeyApproval, "server" | "device">
): string {
  return `${approval.server.id}:${approval.device.id}`;
}
