import type { Locale } from "@pupitre/shared/i18n"
import { useQueryClient } from "@tanstack/react-query"
import { useLocale } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { queryKeys, updateLocale } from "@/lib/api/queries"

export interface LocaleChoice {
  locale: Locale
  choose: (next: Locale) => void
  pending: boolean
  error: string | null
}

// A signed-in account saves the choice too, so the emails follow; signed out, no route is called.
export function useLocaleChoice(): LocaleChoice {
  const { locale, setLocale } = useLocale()
  const queryClient = useQueryClient()
  const save = useRequestCycle()

  const choose = (next: Locale) => {
    setLocale(next)

    if (!queryClient.getQueryData(queryKeys.me)) {
      return
    }

    save.run(async () => {
      await updateLocale(next)
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
    })
  }

  return {
    locale,
    choose,
    pending: save.phase === "pending",
    error: save.error,
  }
}
