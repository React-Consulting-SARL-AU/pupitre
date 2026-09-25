import type { StartupState } from "@shared/startup";
import { create } from "zustand";

interface PreferencesStore {
  /** Null until read: a switch drawn before the answer would flip on its own. */
  notifications: boolean | null;
  startup: StartupState | null;

  read: () => Promise<void>;
  setNotifications: (enabled: boolean) => Promise<void>;
  setStartup: (enabled: boolean) => Promise<void>;
}

export const usePreferences = create<PreferencesStore>((set) => ({
  notifications: null,
  startup: null,

  async read() {
    const [notifications, startup] = await Promise.all([
      window.pupitre.notificationsEnabled(),
      window.pupitre.startupState(),
    ]);

    set({ notifications, startup });
  },

  // Both setters keep the value the main process actually wrote, never the requested one.
  async setNotifications(enabled) {
    set({
      notifications: await window.pupitre.setNotificationsEnabled(enabled),
    });
  },

  async setStartup(enabled) {
    set({ startup: await window.pupitre.setStartupEnabled(enabled) });
  },
}));
