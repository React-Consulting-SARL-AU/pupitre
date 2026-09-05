import { MetricsChart } from "@/components/dashboard/metrics-chart"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"

export interface MetricSample {
  at: string
  disk: number
  ram: number
  load: number
}

export interface ServerMetricsProps {
  samples: MetricSample[]
}

export function ServerMetrics({ samples }: ServerMetricsProps) {
  const t = useTranslations()
  const last = samples.at(-1) ?? null

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
          label={t("servers.disk")}
          latest={last?.disk ?? null}
          values={samples.map((sample) => sample.disk)}
        />
        <MetricsChart
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
