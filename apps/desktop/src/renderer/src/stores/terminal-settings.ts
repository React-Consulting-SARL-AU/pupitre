import { create } from "zustand";
import { readNavigation, writeNavigation } from "../lib/memory";
import {
  DEFAULT_TERMINAL_SETTINGS,
  type TerminalSettings,
  terminalSettingsOf,
} from "../lib/terminal-settings";
import {
  applyTerminalSettings,
  followTerminalSettings,
} from "../lib/terminals";

/**
 * The look of every terminal, chosen once and applied to all of them at once.
 *
 * Like the theme, the choice is remembered with the navigation and handed to
 * the living sessions by hand: xterm draws on a canvas, and a setting that
 * only took effect on the next tab would read as one that did not take.
 */
interface TerminalSettingsStore {
  settings: TerminalSettings;
  set: (patch: Partial<TerminalSettings>) => void;
  reset: () => void;
}

export const useTerminalSettings = create<TerminalSettingsStore>(
  (set, get) => ({
    settings: terminalSettingsOf(readNavigation().terminalSettings),

    set(patch) {
      const settings = terminalSettingsOf({ ...get().settings, ...patch });

      set({ settings });
      writeNavigation({ terminalSettings: settings });
      applyTerminalSettings(settings);
    },

    reset() {
      get().set(DEFAULT_TERMINAL_SETTINGS);
    },
  })
);

/**
 * Hands the remembered look to the registry before any session opens, and
 * lets the zoom shortcuts write their choice down like one made here.
 */
export function startTerminalSettings(): void {
  applyTerminalSettings(useTerminalSettings.getState().settings);
  followTerminalSettings((patch) => useTerminalSettings.getState().set(patch));
}
