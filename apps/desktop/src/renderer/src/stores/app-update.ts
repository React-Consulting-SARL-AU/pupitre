import type { AppAbout, AppUpdateState } from "@shared/app-update";
import { create } from "zustand";

/**
 * The app's own update, as the About screen reads it.
 *
 * The main process checks, downloads and installs on its own; this store holds
 * the state it broadcasts and asks for the two gestures. Nothing here polls: a
 * change arrives on the channel, and the screen follows.
 */

interface AppUpdateStore {
  about: AppAbout | null;
  state: AppUpdateState | null;

  read: () => Promise<void>;
  /** Asks the feed now rather than at the next round. */
  check: () => Promise<void>;
  /** Quits and relaunches on the downloaded version; a no-op unless one is ready. */
  install: () => Promise<void>;
  /** Follows the main process's broadcasts; returns what stops following. */
  listen: () => () => void;
}

export const useAppUpdate = create<AppUpdateStore>((set) => ({
  about: null,
  state: null,

  async read() {
    const [about, state] = await Promise.all([
      window.pupitre.appAbout(),
      window.pupitre.appUpdateState(),
    ]);

    set({ about, state });
  },

  async check() {
    set({ state: await window.pupitre.checkAppUpdate() });
  },

  async install() {
    set({ state: await window.pupitre.installAppUpdate() });
  },

  listen() {
    return window.pupitre.onAppUpdate((state) => set({ state }));
  },
}));
