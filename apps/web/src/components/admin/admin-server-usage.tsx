import { Activity } from "lucide-react"
import { AdminFacts } from "@/components/admin/admin-facts"
import { ServerMetrics } from "@/components/dashboard/server-metrics"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminServerDetail } from "@/lib/api/admin-queries"
import { formatDateTime, formatRatio } from "@/lib/utils/format"

export interface AdminServerUsageProps {
  server: AdminServerDetail
}

export function AdminServerUsage({ server }: AdminServerUsageProps) {
  const t = useTranslations()
  const usage = server.usage
  const samples = server.metrics

  if (!usage && samples.length === 0) {
    return <EmptyState icon={Activity} title={t("admin.servers.noUsage")} />
  }

  return (
    <div className="flex flex-col gap-gutter">
      {usage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.servers.usageAt")}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {formatDateTime(usage.at, t)}
            </span>
          </CardHeader>

          <AdminFacts
            facts={[
              { label: t("servers.disk"), value: formatRatio(usage.disk, t) },
              { label: t("servers.ram"), value: formatRatio(usage.ram, t) },
              { label: t("servers.load"), value: usage.load },
            ]}
          />
        </Card>
      ) : null}

      {samples.length > 0 ? <ServerMetrics samples={samples} /> : null}
    </div>
  )
}
