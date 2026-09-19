import { LOCALES, type Locale } from "@pupitre/shared/i18n"
import { copyrightHolder } from "@pupitre/shared/legal"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  ExternalLink,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  Sun,
} from "lucide-react"
import {
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useLocaleChoice } from "@/hooks/use-locale-choice"
import { useTheme } from "@/hooks/use-theme"
import { authClient } from "@/lib/auth/client"
import { LEGAL_PAGES, legalUrl } from "@/lib/domain/legal-pages"
import { initialOf } from "@/lib/domain/organization"
import type { DictionaryKey } from "@/lib/i18n/en"
import { THEMES, type Theme } from "@/lib/theme"

const THEME_ICONS: Record<Theme, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

export function SidebarAccountMenu() {
  const t = useTranslations()
  const { user } = useDashboardContext()
  const { locale, choose, pending, error } = useLocaleChoice()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function signOut() {
    await authClient().signOut()
    queryClient.clear()
    await navigate({ to: "/auth/sign-in" })
  }

  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={t("sidebar.account")}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-fast hover:bg-raised focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
        title={t("sidebar.account")}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised font-data text-[11px] text-ink-2">
          {initialOf(user.name || user.email)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">
            {user.name || user.email}
          </span>
          {user.name && user.name !== user.email ? (
            <span className="block truncate text-[11px] text-ink-3">
              {user.email}
            </span>
          ) : null}
        </span>
        <MoreHorizontal
          className="size-4 shrink-0 text-ink-3"
          strokeWidth={1.5}
        />
      </MenuTrigger>

      <MenuPopup className="w-[264px]" side="top">
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
                <MenuRadioItem
                  closeOnClick={false}
                  key={candidate}
                  value={candidate}
                >
                  <Icon className="size-4 text-ink-3" strokeWidth={1.5} />
                  {t(`footer.theme.${candidate}` as DictionaryKey)}
                </MenuRadioItem>
              )
            })}
          </MenuRadioGroup>
        </MenuGroup>

        <MenuSeparator />

        <MenuGroup>
          <MenuGroupLabel>{t("footer.language")}</MenuGroupLabel>
          <MenuRadioGroup
            onValueChange={(value) => {
              choose(value as Locale)
            }}
            value={locale}
          >
            {LOCALES.map((candidate) => (
              <MenuRadioItem
                closeOnClick={false}
                disabled={pending}
                key={candidate}
                value={candidate}
              >
                {t(`footer.language.${candidate}` as DictionaryKey)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>

        {error ? (
          <p className="px-3 pb-1 text-[12px] text-danger">{error}</p>
        ) : null}

        <MenuSeparator />

        <MenuGroup>
          <MenuGroupLabel>{t("footer.legal")}</MenuGroupLabel>
          {LEGAL_PAGES.map((page) => (
            <MenuItem
              key={page.slug}
              render={
                <a
                  href={legalUrl(page.slug, locale)}
                  rel="noreferrer"
                  target="_blank"
                />
              }
            >
              {t(page.key)}
              <ExternalLink
                className="ml-auto size-3.5 text-ink-3"
                strokeWidth={1.5}
              />
            </MenuItem>
          ))}
          <MenuItem render={<a href="/status" />}>
            {t("footer.status")}
          </MenuItem>
        </MenuGroup>

        <MenuSeparator />

        <MenuItem
          onClick={() => {
            signOut()
          }}
        >
          <LogOut className="size-4 text-ink-3" strokeWidth={1.5} />
          {t("nav.signOut")}
        </MenuItem>

        <p className="px-3 pt-2 pb-1 text-[11px] text-ink-3 leading-[1.5]">
          {t("footer.company", {
            year: new Date().getFullYear(),
            entity: copyrightHolder(),
          })}
        </p>
      </MenuPopup>
    </MenuRoot>
  )
}
