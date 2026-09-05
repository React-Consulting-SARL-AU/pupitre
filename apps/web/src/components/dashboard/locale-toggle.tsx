import { LOCALES, type Locale } from "@pupitre/shared/i18n"
import { useQueryClient } from "@tanstack/react-query"
import { Languages } from "lucide-react"
import {
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import { useLocale, useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { updateLocale } from "@/lib/api/queries"
import type { DictionaryKey } from "@/lib/i18n/en"

/**
 * One language for the person: the console changes on the spot, and the
 * account follows so the emails speak it too.
 */
export function LocaleToggle() {
  const t = useTranslations()
  const { locale, setLocale } = useLocale()
  const queryClient = useQueryClient()
  const save = useRequestCycle()

  const choose = (value: string) => {
    const next = value as Locale

    setLocale(next)

    return save.run(async () => {
      await updateLocale(next)
      await queryClient.invalidateQueries()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <MenuRoot>
        <MenuTrigger
          aria-label={t("footer.language")}
          className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] text-ink-2 transition-colors duration-[120ms] ease-[ease] hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          disabled={save.phase === "pending"}
        >
          <Languages className="size-4" strokeWidth={1.5} />
          {t(`footer.language.${locale}` as DictionaryKey)}
        </MenuTrigger>
        <MenuPopup>
          <MenuGroup>
            <MenuGroupLabel>{t("footer.language")}</MenuGroupLabel>
            <MenuRadioGroup
              onValueChange={(value) => {
                choose(value)
              }}
              value={locale}
            >
              {LOCALES.map((candidate) => (
                <MenuRadioItem key={candidate} value={candidate}>
                  {t(`footer.language.${candidate}` as DictionaryKey)}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        </MenuPopup>
      </MenuRoot>
      {save.error ? (
        <span className="text-[12px] text-danger">{save.error}</span>
      ) : null}
    </div>
  )
}
