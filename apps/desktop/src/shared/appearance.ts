import { DARK, LIGHT } from "@pupitre/design/tokens";

export type ThemePreference = "system" | "light" | "dark";

export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

/** `preference` keeps `nativeTheme` following the system; `resolved` is the colour the frame paints. */
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
