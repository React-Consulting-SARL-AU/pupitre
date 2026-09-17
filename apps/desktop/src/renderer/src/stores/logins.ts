import type { Login } from "@pupitre/shared/agent-protocol/state";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

/**
 * What each running module's CLI says of its own account, for the dashboard.
 *
 * The snapshot never carries it — asking a CLI can cost a round trip to its
 * provider — so the dashboard asks `service.status` once per running module
 * when it opens, and keeps the answer until it opens again. A module whose CLI
 * has no account answers `null`, and the card says nothing of it. An answer
 * already held stays on screen while the same question is asked again.
 */
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
  /** Which reading is the current one: an older one, still asking, stops. */
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

      // One question at a time: the agent answers its channel in order, and
      // the snapshot read every few seconds should not wait behind all of
      // them. A newer reading takes the questions over: this one stops.
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
