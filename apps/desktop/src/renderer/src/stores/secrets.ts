import type { SecretStatus } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

/**
 * The state of the server's environment keys — never their values.
 *
 * The agent says which keys it holds and whether each is filled in; it never
 * says what is in one, and nothing here would have anywhere to put it. A value
 * typed on the screen crosses to the main process and is written on the
 * protocol's secret line, and the store only ever learns that it worked.
 */

export type SecretsState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; secrets: SecretStatus[] }
  | { status: "failed"; error: AgentError };

interface SecretsStore {
  state: SecretsState;
  /** The key whose value is being written, so its row waits. */
  saving: string | null;
  problem: AgentError | null;
  /** The key just written, so the row says so without repeating a value. */
  saved: string | null;

  read: (serverId: string) => Promise<void>;
  save: (serverId: string, key: string, value: string) => Promise<boolean>;
  forget: () => void;
}

export const useSecrets = create<SecretsStore>((set, get) => ({
  problem: null,
  saved: null,
  saving: null,
  state: { status: "idle" },

  async read(serverId) {
    set({ state: { status: "reading" } });

    const answer = await window.pupitre.secretsStatus(serverId);

    set({
      state: answer.ok
        ? { secrets: answer.result.secrets, status: "read" }
        : { error: answer.error, status: "failed" },
    });
  },

  async save(serverId, key, value) {
    set({ problem: null, saved: null, saving: key });

    const answer = await window.pupitre.setSecret(serverId, key, value);

    set({
      problem: answer.ok ? null : answer.error,
      saved: answer.ok ? key : null,
      saving: null,
    });

    if (answer.ok) {
      await get().read(serverId);
    }

    return answer.ok;
  },

  forget() {
    set({
      problem: null,
      saved: null,
      saving: null,
      state: { status: "idle" },
    });
  },
}));
