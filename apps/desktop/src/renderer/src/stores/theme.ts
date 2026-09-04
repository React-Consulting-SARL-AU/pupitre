import { create } from "zustand";
import { readNavigation, writeNavigation } from "../lib/memory";
import type { ResolvedTheme } from "../lib/terminal-theme";
import { repaintTerminals } from "../lib/terminals";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(
  value: string | undefined
): value is ThemePreference {
  return value !== undefined && (THEME_PREFERENCES as string[]).includes(value);
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * The whole switch, in three lines.
 *
 * `data-theme` on `<html>` is what the tokens of `@pupitre/design` key off, so
 * setting the attribute repaints the entire interface — no reload, no re-render.
 * The terminal draws on a canvas and knows nothing of CSS, so it is handed the
 * new palette by hand, right after the attribute changes.
 */
function paint(preference: ThemePreference, resolved: ResolvedTheme): void {
  const root = document.documentElement;

  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }

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

/**
 * Applies the remembered choice and follows the system while it stays "system".
 *
 * Called once, before the first render: the attribute has to be on `<html>`
 * before anything paints, otherwise the window flashes the wrong theme.
 */
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
