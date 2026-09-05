import { PasskeyPanel } from "@/components/dashboard/passkey-panel"
import { TwoFactorPanel } from "@/components/dashboard/two-factor-panel"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"

export function SecurityCard() {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security")}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-section">
        <p className="text-[13px] text-ink-2">{t("settings.securityLead")}</p>

        <PasskeyPanel />

        <div aria-hidden="true" className="h-px bg-line" />

        <TwoFactorPanel />
      </CardBody>
    </Card>
  )
}
