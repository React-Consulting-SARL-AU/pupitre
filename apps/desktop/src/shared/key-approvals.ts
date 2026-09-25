import type { PendingKeyApproval } from "@pupitre/shared/keys";
import type { KeyApprovalReceipt as SharedKeyApprovalReceipt } from "@pupitre/shared/platform-api/account";

export type KeyApprovalReceipt = SharedKeyApprovalReceipt;

export function approvalKeyOf(
  approval: Pick<PendingKeyApproval, "server" | "device">
): string {
  return `${approval.server.id}:${approval.device.id}`;
}
