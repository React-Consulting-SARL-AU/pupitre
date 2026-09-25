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

export function startTerminalSettings(): void {
  applyTerminalSettings(useTerminalSettings.getState().settings);
  followTerminalSettings((patch) => useTerminalSettings.getState().set(patch));
}
