import { LOCALES, type Locale } from "@pupitre/shared/i18n"
import { developmentNotice, legalEntityLabel } from "@pupitre/shared/legal"
import type { LucideIcon } from "lucide-react"
import { Languages, Monitor, Moon, Sun } from "lucide-react"
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
import { useTheme } from "@/hooks/use-theme"
import { LEGAL_PAGES, legalUrl } from "@/lib/domain/legal-pages"
import type { DictionaryKey } from "@/lib/i18n/en"
import { THEMES, type Theme } from "@/lib/theme"

const THEME_ICONS: Record<Theme, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

const TRIGGER =
  "flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-ink-3 transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"

/**
 * On every page, signed in or not: the theme, the language, and the legal
 * pages. The auth screens need them as much as the console does.
 */
export function ConsoleFooter() {
  const t = useTranslations()
  const { locale, choose, pending, error } = useLocaleChoice()
  const { theme, setTheme } = useTheme()
  const ThemeIcon = THEME_ICONS[theme]

  return (
    <footer className="border-line border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-8 py-5 text-[12px] text-ink-3">
        <p>
          {t("footer.company", {
            year: new Date().getFullYear(),
            entity: legalEntityLabel(locale),
          })}
        </p>

        <p>{developmentNotice(locale).short}</p>

        <nav
          aria-label={t("footer.legal")}
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          {LEGAL_PAGES.map((page) => (
            <a
              className="rounded-full hover:text-ink"
              href={legalUrl(page.slug, locale)}
              key={page.slug}
              rel="noreferrer"
              target="_blank"
            >
              {t(page.key)}
            </a>
          ))}
          <a
            className="rounded-full hover:text-ink"
            href="/status"
            rel="noreferrer"
          >
            {t("footer.status")}
          </a>
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <MenuRoot>
            <MenuTrigger aria-label={t("footer.theme")} className={TRIGGER}>
              <ThemeIcon className="size-4" strokeWidth={1.5} />
            </MenuTrigger>
            <MenuPopup>
              <MenuGroup>
                <MenuGroupLabel>{t("footer.theme")}</MenuGroupLabel>
                <MenuRadioGroup
                  onValueChange={(value) => {
                    setTheme(value as Theme)
                  }}
                  value={theme}
                >
                  {THEMES.map((candidate) => {
                    const Icon = THEME_ICONS[candidate]

                    return (
                      <MenuRadioItem key={candidate} value={candidate}>
                        <Icon className="size-4 text-ink-3" strokeWidth={1.5} />
                        {t(`footer.theme.${candidate}` as DictionaryKey)}
                      </MenuRadioItem>
                    )
                  })}
                </MenuRadioGroup>
              </MenuGroup>
            </MenuPopup>
          </MenuRoot>

          <MenuRoot>
            <MenuTrigger
              aria-label={t("footer.language")}
              className={TRIGGER}
              disabled={pending}
            >
              <Languages className="size-4" strokeWidth={1.5} />
              {locale.toUpperCase()}
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

          {error ? (
            <span className="text-[12px] text-danger">{error}</span>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
