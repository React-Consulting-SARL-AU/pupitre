import type { SshShareState } from "@shared/ssh-names";
import { create } from "zustand";

interface SshShareStore {
  /** Null until read: a switch drawn before the answer would flip on its own. */
  state: SshShareState | null;

  read: () => Promise<void>;
  set: (shared: boolean) => Promise<void>;
}

export const useSshShare = create<SshShareStore>((set) => ({
  state: null,

  async read() {
    set({ state: await window.pupitre.sshShareState() });
  },

  async set(shared) {
    set({ state: await window.pupitre.setSshShare(shared) });
  },
}));
