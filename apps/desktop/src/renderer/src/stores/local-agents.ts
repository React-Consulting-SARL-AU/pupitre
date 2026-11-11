import type { LocalAgentsState } from "@pupitre/shared/desktop-mcp";
import { create } from "zustand";

interface LocalAgentsStore {
  /** Null until read: a switch drawn before the answer would flip on its own. */
  state: LocalAgentsState | null;

  read: () => Promise<void>;
  set: (enabled: boolean) => Promise<void>;
  setUnattended: (unattended: boolean) => Promise<void>;
}

export const useLocalAgents = create<LocalAgentsStore>((set) => ({
  state: null,

  async read() {
    set({ state: await window.pupitre.localAgentsState() });
  },

  async set(enabled) {
    set({ state: await window.pupitre.setLocalAgents(enabled) });
  },

  async setUnattended(unattended) {
    set({ state: await window.pupitre.setLocalAgentsUnattended(unattended) });
  },
}));
