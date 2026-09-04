import { useLocale } from "@renderer/stores/locale";
import { useMemo } from "react";
import { type Translate, translator } from "./i18n";

export function useTranslations(): Translate {
  const locale = useLocale((s) => s.resolved);

  return useMemo(() => translator(locale), [locale]);
}
