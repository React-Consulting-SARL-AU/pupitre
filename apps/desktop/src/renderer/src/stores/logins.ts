import type { Login } from "@pupitre/shared/agent-protocol/state";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

// Never in the snapshot: asking a CLI can cost a round trip to its provider.
export type LoginAnswer =
  | { status: "asking" }
  | { status: "answered"; login: Login | null }
  | { status: "failed"; error: AgentError };

interface LoginsStore {
  serverId: string | null;
  answers: Readonly<Record<string, LoginAnswer>>;
  read: (serverId: string, moduleIds: readonly string[]) => Promise<void>;
  forget: () => void;
}

export const useLogins = create<LoginsStore>((set, get) => {
  // Bumped by every read and forget, so an older reading still asking stops.
  let turn = 0;

  return {
    answers: {},
    serverId: null,

    async read(serverId, moduleIds) {
      turn += 1;

      const asked = turn;

      set((state) => ({
        answers: Object.fromEntries(
          moduleIds.map((moduleId) => [
            moduleId,
            (state.serverId === serverId ? state.answers[moduleId] : null) ?? {
              status: "asking",
            },
          ])
        ),
        serverId,
      }));

      // One at a time: the channel answers in order, and the periodic snapshot must not queue behind them all.
      for (const moduleId of moduleIds) {
        if (asked !== turn) {
          return;
        }

        const answer = await window.pupitre.serviceDetail(serverId, moduleId);

        if (get().serverId !== serverId) {
          return;
        }

        set((state) => ({
          answers: {
            ...state.answers,
            [moduleId]: answer.ok
              ? { login: answer.result.login ?? null, status: "answered" }
              : { error: answer.error, status: "failed" },
          },
        }));
      }
    },

    forget() {
      turn += 1;

      set({ answers: {}, serverId: null });
    },
  };
});
