import type { SudoOutcome, SudoPasswordState } from "@shared/sudo";
import { create } from "zustand";

/**
 * What this computer holds of each server's sudo password (decision 0015).
 *
 * The password itself is never state: it crosses for the one reveal asked for,
 * and a copy is written to the clipboard by the main process.
 */

interface SudoPasswordStore {
  states: Readonly<Record<string, SudoPasswordState>>;
  read: (serverId: string) => Promise<void>;
  reveal: (serverId: string) => Promise<string | null>;
  copy: (serverId: string) => Promise<boolean>;
  enter: (serverId: string, password: string) => Promise<SudoOutcome>;
  forget: () => void;
}

export const useSudoPassword = create<SudoPasswordStore>((set, get) => ({
  states: {},

  async read(serverId) {
    const state = await window.pupitre.sudoPasswordState(serverId);
    const held = get().states[serverId];

    if (held?.held === state.held && held.kept === state.kept) {
      return;
    }

    set((current) => ({ states: { ...current.states, [serverId]: state } }));
  },

  reveal(serverId) {
    return window.pupitre.revealSudoPassword(serverId);
  },

  copy(serverId) {
    return window.pupitre.copySudoPassword(serverId);
  },

  async enter(serverId, password) {
    const outcome = await window.pupitre.enterSudoPassword(serverId, password);

    if (outcome.ok) {
      await get().read(serverId);
    }

    return outcome;
  },

  forget() {
    set({ states: {} });
  },
}));
