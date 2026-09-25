import type { AppAbout, AppUpdateState } from "@shared/app-update";
import { create } from "zustand";

interface AppUpdateStore {
  about: AppAbout | null;
  state: AppUpdateState | null;

  read: () => Promise<void>;
  check: () => Promise<void>;
  // Quits and relaunches; a no-op unless a downloaded version is ready.
  install: () => Promise<void>;
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
