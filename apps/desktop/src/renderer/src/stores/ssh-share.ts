import type { SshShareState } from "@shared/ssh-names";
import { create } from "zustand";

/**
 * Whether the system's own SSH file includes the app's, read over the bridge.
 *
 * Nothing is remembered here: the main process reads the file and answers
 * with what it says, and every switch answers with what was actually written,
 * so the screen never shows a wish the file refused.
 */

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
