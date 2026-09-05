import type { Locale } from "@pupitre/shared/i18n"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { DEFAULT_LOCALE, type Translate, translator } from "@/lib/i18n/i18n"
import { writeLocaleCookie } from "@/lib/i18n/locale"

export interface LocaleControl {
  locale: Locale
  setLocale: (next: Locale) => void
}

const LocaleContext = createContext<LocaleControl>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
})

export function LocaleProvider({
  children,
  initial,
}: {
  children: ReactNode
  initial: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initial)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    writeLocaleCookie(next)
    document.documentElement.lang = next
  }, [])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  )
}

export function useLocale(): LocaleControl {
  return useContext(LocaleContext)
}

export function useTranslations(): Translate {
  const { locale } = useLocale()

  return useMemo(() => translator(locale), [locale])
}
