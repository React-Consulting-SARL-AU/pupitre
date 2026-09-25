import type { EnrollResult } from "@pupitre/shared/agent-protocol/system";
import type { AccountState } from "@shared/account";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

export type ReenrollState =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; result: EnrollResult }
  | { status: "failed"; serverId: string; error: AgentError };

interface ReenrollStore {
  state: ReenrollState;

  repair: (serverId: string) => Promise<void>;
  forget: () => void;
}

// Without a usage right or a known device the platform would refuse the enrolment anyway.
export function repairable(account: AccountState): boolean {
  return account.usage.status === "granted" && account.device !== null;
}

export const useReenroll = create<ReenrollStore>((set) => ({
  state: { status: "idle" },

  async repair(serverId) {
    set({ state: { serverId, status: "running" } });

    const answer = await window.pupitre.reenrollServer(serverId);

    set({
      state: answer.ok
        ? { result: answer.result, serverId, status: "done" }
        : { error: answer.error, serverId, status: "failed" },
    });
  },

  forget() {
    set({ state: { status: "idle" } });
  },
}));
