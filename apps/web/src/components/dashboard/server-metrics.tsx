import { MetricsChart } from "@/components/dashboard/metrics-chart"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"

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
  const last = samples.at(-1) ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sept derniers jours</CardTitle>
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {samples.length} relevés
        </span>
      </CardHeader>
      <CardBody className="grid gap-gutter sm:grid-cols-3">
        <MetricsChart
          label="Disque"
          latest={last?.disk ?? null}
          values={samples.map((sample) => sample.disk)}
        />
        <MetricsChart
          label="RAM"
          latest={last?.ram ?? null}
          values={samples.map((sample) => sample.ram)}
        />
        <MetricsChart
          label="Charge"
          latest={last ? last.load * 100 : null}
          values={samples.map((sample) => sample.load * 100)}
        />
      </CardBody>
    </Card>
  )
}
