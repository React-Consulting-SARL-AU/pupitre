import { useLocale } from "@renderer/stores/locale";
import { type Locale, type Translate, translator } from "./i18n";

/** For code outside React: reads the locale at call time, so a language change lands on the next render. */
export function translate(): Translate {
  return translator(useLocale.getState().resolved);
}

export function currentLocale(): Locale {
  return useLocale.getState().resolved;
}
