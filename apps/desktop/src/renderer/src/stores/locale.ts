import { create } from "zustand";
import { isLocale, type Locale, systemLocale } from "../i18n/i18n";
import { readNavigation, writeNavigation } from "../lib/memory";

export type LocalePreference = "system" | Locale;

export const LOCALE_PREFERENCES: readonly LocalePreference[] = [
  "system",
  "en",
  "fr",
];

function isPreference(value: unknown): value is LocalePreference {
  return value === "system" || isLocale(value);
}

function resolve(preference: LocalePreference): Locale {
  return preference === "system" ? systemLocale() : preference;
}

function paint(resolved: Locale): void {
  try {
    document.documentElement.lang = resolved;
  } catch {
    // No document (tests): the choice still lives in the store.
  }

  // Sent with the next hello, so the agent replies in this language.
  window.pupitre?.setLocale?.(resolved);
}

interface LocaleStore {
  preference: LocalePreference;
  resolved: Locale;
  setPreference: (preference: LocalePreference) => void;
}

const remembered = readNavigation().locale;
const initial: LocalePreference = isPreference(remembered)
  ? remembered
  : "system";

export const useLocale = create<LocaleStore>((set) => ({
  preference: initial,
  resolved: resolve(initial),

  setPreference(preference) {
    const resolved = resolve(preference);

    set({ preference, resolved });
    writeNavigation({ locale: preference });
    paint(resolved);
  },
}));

export function startLocaleWatch(): void {
  paint(useLocale.getState().resolved);
}
