import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { FREE_SERVERS, type MeServers } from "@pupitre/shared/plans"
import { UsageBar } from "@/components/dashboard/usage-bar"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"

export interface LicenseServersCardProps {
  servers: MeServers
}

function fillPercent({ used, limit }: MeServers): number | null {
  return limit === 0 ? null : (used / limit) * 100
}

export function LicenseServersCard({ servers }: LicenseServersCardProps) {
  const t = useTranslations()
  const { used, limit } = servers
  const email = LEGAL_CONTACTS.support

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("license.servers.title")}</CardTitle>
        <span className="font-data text-[12px] text-ink-2 tabular-nums">
          {used} / {limit}
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <UsageBar
          label={t("license.servers.used")}
          percent={fillPercent(servers)}
        />

        <p className="text-[13px] text-ink-2">
          {t("license.servers.free", { free: FREE_SERVERS, email })}
        </p>

        {used > limit ? (
          <Callout
            fix={t("license.servers.fix", { email })}
            title={t("license.servers.overTitle")}
            tone="danger"
          />
        ) : null}

        {used === limit ? (
          <Callout
            fix={t("license.servers.fix", { email })}
            title={t("license.servers.fullTitle")}
          />
        ) : null}
      </CardBody>
    </Card>
  )
}
