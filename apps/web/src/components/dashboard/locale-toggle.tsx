import { LOCALES, type Locale } from "@pupitre/shared/i18n"
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
import { useTranslations } from "@/hooks/use-locale"
import { useLocaleChoice } from "@/hooks/use-locale-choice"
import type { DictionaryKey } from "@/lib/i18n/en"

// Saved on the account too, so the emails use the same language.
export function LocaleToggle() {
  const t = useTranslations()
  const { locale, choose, pending, error } = useLocaleChoice()

  return (
    <div className="flex flex-col items-end gap-1">
      <MenuRoot>
        <MenuTrigger
          aria-label={t("footer.language")}
          className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] text-ink-2 transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          disabled={pending}
          title={t("footer.language")}
        >
          <Languages className="size-4" strokeWidth={1.5} />
          {t(`footer.language.${locale}` as DictionaryKey)}
        </MenuTrigger>
        <MenuPopup>
          <MenuGroup>
            <MenuGroupLabel>{t("footer.language")}</MenuGroupLabel>
            <MenuRadioGroup
              onValueChange={(value) => {
                choose(value as Locale)
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
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </div>
  )
}
