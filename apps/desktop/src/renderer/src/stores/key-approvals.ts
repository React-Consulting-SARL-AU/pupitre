import type { PendingKeyApproval } from "@pupitre/shared/keys";
import type { AgentError } from "@shared/agent";
import { approvalKeyOf } from "@shared/key-approvals";
import { create } from "zustand";

export type KeyApprovalsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; approvals: PendingKeyApproval[] }
  | { status: "failed"; error: AgentError };

export type ApprovalProgress =
  | { status: "signing" }
  | { status: "refused"; error: AgentError }
  | { status: "allowed" };

interface KeyApprovalsStore {
  state: KeyApprovalsState;
  // Keyed by `approvalKeyOf` so only the clicked row waits or shows its refusal.
  progress: Record<string, ApprovalProgress>;
  read: () => Promise<void>;
  approve: (approval: PendingKeyApproval) => Promise<void>;
  forget: () => void;
}

export const useKeyApprovals = create<KeyApprovalsStore>((set, get) => ({
  state: { status: "idle" },
  progress: {},

  async read() {
    if (get().state.status !== "ready") {
      set({ state: { status: "loading" } });
    }

    const answer = await window.pupitre.keyApprovals();

    set({
      state: answer.ok
        ? { approvals: answer.result, status: "ready" }
        : { error: answer.error, status: "failed" },
    });
  },

  async approve(approval) {
    const key = approvalKeyOf(approval);

    set({ progress: { ...get().progress, [key]: { status: "signing" } } });

    const answer = await window.pupitre.approveKey(
      approval.server.id,
      approval.device.id
    );

    set({
      progress: {
        ...get().progress,
        [key]: answer.ok
          ? { status: "allowed" }
          : { error: answer.error, status: "refused" },
      },
    });
  },

  forget() {
    set({ progress: {}, state: { status: "idle" } });
  },
}));
