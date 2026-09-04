import { DARK, LIGHT } from "@pupitre/design/tokens";

/**
 * The theme, on both sides of the bridge.
 *
 * The renderer owns the choice — it is remembered with the navigation — and the
 * main process owns the window frame. What crosses is the preference, which
 * `nativeTheme` needs to keep following the system, and the theme the renderer
 * actually resolved, which is the colour the edges have to paint.
 */

export type ThemePreference = "system" | "light" | "dark";

export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

export interface Appearance {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

export function readAppearance(value: unknown): Appearance | null {
  const candidate = value as Partial<Appearance> | null;

  if (
    !(
      isThemePreference(candidate?.preference) &&
      isResolvedTheme(candidate?.resolved)
    )
  ) {
    return null;
  }

  return { preference: candidate.preference, resolved: candidate.resolved };
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

/** The window has no stylesheet, so its background comes from the tokens as data. */
export function windowBackground(resolved: ResolvedTheme): string {
  return resolved === "dark" ? DARK.base : LIGHT.base;
}
