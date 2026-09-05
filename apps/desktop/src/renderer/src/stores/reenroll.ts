import type { EnrollResult } from "@pupitre/shared/agent-protocol/system";
import type { AccountState } from "@shared/account";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

/**
 * Repairing a server whose token the platform revoked.
 *
 * The store holds the envelope the main process handed back and nothing else:
 * the enrolment token is asked, used and burnt on the other side of the bridge,
 * and never reaches a screen. The right itself is not read here — the next
 * `snapshot` is what says the server acts again.
 */

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

/**
 * Whether this account may repair anything at all.
 *
 * The two refusals are distinct: an account without a usage right would be
 * refused by the platform, not by the server, so the gesture is not offered —
 * it would trade one dead end for another. A build with no device known to the
 * platform has no one to sign an enrolment for, and is in the same case.
 */
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
