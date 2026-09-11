import { MetricsChart } from "@/components/dashboard/metrics-chart"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import {
  formatUsed,
  gigabytesToBytes,
  megabytesToBytes,
} from "@/lib/utils/format"

export interface MetricSample {
  at: string
  disk: number
  ram: number
  load: number
  disk_total_gb: number | null
  disk_free_gb: number | null
  ram_total_mb: number | null
  ram_used_mb: number | null
}

export interface ServerMetricsProps {
  samples: MetricSample[]
}

export function ServerMetrics({ samples }: ServerMetricsProps) {
  const t = useTranslations()
  const last = samples.at(-1) ?? null

  // The disk is reported as what it holds and what is left; what is taken is the
  // difference, and it is the figure a reader is looking for.
  const diskTotal = gigabytesToBytes(last?.disk_total_gb ?? null)
  const diskFree = gigabytesToBytes(last?.disk_free_gb ?? null)
  const diskUsed =
    diskTotal === null || diskFree === null ? null : diskTotal - diskFree

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("servers.metrics.title")}</CardTitle>
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {t("servers.metrics.samples", { count: samples.length })}
        </span>
      </CardHeader>
      <CardBody className="grid gap-gutter sm:grid-cols-3">
        <MetricsChart
          detail={formatUsed(diskUsed, diskTotal, t)}
          label={t("servers.disk")}
          latest={last?.disk ?? null}
          values={samples.map((sample) => sample.disk)}
        />
        <MetricsChart
          detail={formatUsed(
            megabytesToBytes(last?.ram_used_mb ?? null),
            megabytesToBytes(last?.ram_total_mb ?? null),
            t
          )}
          label={t("servers.ram")}
          latest={last?.ram ?? null}
          values={samples.map((sample) => sample.ram)}
        />
        <MetricsChart
          label={t("servers.load")}
          latest={last ? last.load * 100 : null}
          values={samples.map((sample) => sample.load * 100)}
        />
      </CardBody>
    </Card>
  )
}
