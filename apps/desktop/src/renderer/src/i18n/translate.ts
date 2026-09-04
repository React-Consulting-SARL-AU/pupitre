import { useLocale } from "@renderer/stores/locale";
import { type Locale, type Translate, translator } from "./i18n";

/**
 * A translator for code that runs outside React — the number and duration
 * formatters. It reads the chosen locale from the store at call time, so a
 * language change is picked up on the next render the value takes part in.
 */
export function translate(): Translate {
  return translator(useLocale.getState().resolved);
}

export function currentLocale(): Locale {
  return useLocale.getState().resolved;
}
