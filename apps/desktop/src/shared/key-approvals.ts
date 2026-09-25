import type { PendingKeyApproval } from "@pupitre/shared/keys";

/** What the platform keeps of an approval it accepted: `POST /me/key-approvals`, 201. */
export interface KeyApprovalReceipt {
  server_id: string;
  device_id: string;
  signer: string;
  issued_at: string;
}

/** One pending key, named the way the renderer asks for it: a server and a device. */
export function approvalKeyOf(
  approval: Pick<PendingKeyApproval, "server" | "device">
): string {
  return `${approval.server.id}:${approval.device.id}`;
}
