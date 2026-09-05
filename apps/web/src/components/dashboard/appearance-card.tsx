import { LocaleToggle } from "@/components/dashboard/locale-toggle"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"

export function AppearanceCard() {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance")}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[13px] text-ink">{t("settings.theme")}</p>
            <p className="text-[13px] text-ink-2">{t("settings.themeHelp")}</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[13px] text-ink">{t("settings.language")}</p>
            <p className="text-[13px] text-ink-2">
              {t("settings.languageHelp")}
            </p>
          </div>
          <LocaleToggle />
        </div>
      </CardBody>
    </Card>
  )
}
