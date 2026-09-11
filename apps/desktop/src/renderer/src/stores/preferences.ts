import type { StartupState } from "@shared/startup";
import { create } from "zustand";

/**
 * The two preferences the main process keeps for itself, read over the bridge.
 *
 * Neither is remembered here: the window asks, draws what it was told, and
 * every switch answers with the value that was actually written, so the screen
 * never shows a wish the file refused.
 */

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

  async setNotifications(enabled) {
    set({
      notifications: await window.pupitre.setNotificationsEnabled(enabled),
    });
  },

  async setStartup(enabled) {
    set({ startup: await window.pupitre.setStartupEnabled(enabled) });
  },
}));
