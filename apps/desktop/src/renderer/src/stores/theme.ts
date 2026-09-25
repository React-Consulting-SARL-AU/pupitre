import {
  isThemePreference,
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from "@shared/appearance";
import { create } from "zustand";
import { readNavigation, writeNavigation } from "../lib/memory";
import { repaintTerminals } from "../lib/terminals";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

// The terminal canvas and the native frame ignore CSS, so both are told the theme by hand.
function paint(preference: ThemePreference, resolved: ResolvedTheme): void {
  const root = document.documentElement;

  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }

  window.pupitre?.setAppearance({ preference, resolved });
  repaintTerminals(resolved);
}

interface ThemeStore {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const remembered = readNavigation().theme;
const initial: ThemePreference = isThemePreference(remembered)
  ? remembered
  : "system";

export const useTheme = create<ThemeStore>((set) => ({
  preference: initial,
  resolved: resolveTheme(initial, systemPrefersDark()),

  setPreference(preference) {
    const resolved = resolveTheme(preference, systemPrefersDark());

    set({ preference, resolved });
    writeNavigation({ theme: preference });
    paint(preference, resolved);
  },
}));

/** Call before the first render, or the window flashes the wrong theme. */
export function startThemeWatch(): () => void {
  const media = window.matchMedia(DARK_QUERY);

  const sync = () => {
    const { preference } = useTheme.getState();
    const resolved = resolveTheme(preference, media.matches);

    useTheme.setState({ resolved });
    paint(preference, resolved);
  };

  sync();
  media.addEventListener("change", sync);

  return () => media.removeEventListener("change", sync);
}
