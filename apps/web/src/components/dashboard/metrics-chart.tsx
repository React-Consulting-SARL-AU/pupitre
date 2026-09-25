const VIEW_WIDTH = 100
const VIEW_HEIGHT = 30

export interface MetricsChartProps {
  label: string
  values: number[]
  latest: number | null
  /** What the percentage is a percentage of, when the agent measured it. */
  detail?: string | null
}

function polyline(values: number[]): string {
  if (values.length === 0) {
    return ""
  }

  const step = values.length === 1 ? 0 : VIEW_WIDTH / (values.length - 1)

  return values
    .map((value, index) => {
      const x = values.length === 1 ? VIEW_WIDTH : index * step
      const y =
        VIEW_HEIGHT - (Math.max(0, Math.min(100, value)) / 100) * VIEW_HEIGHT

      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}

export function MetricsChart({
  label,
  values,
  latest,
  detail = null,
}: MetricsChartProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-label">{label}</span>
        <span className="font-data text-[12px] text-ink tabular-nums">
          {latest === null ? "—" : `${Math.round(latest)} %`}
        </span>
      </div>
      {detail ? (
        <p className="font-data text-[11px] text-ink-3 tabular-nums">
          {detail}
        </p>
      ) : null}
      <svg
        aria-hidden="true"
        className="mt-auto h-[48px] w-full rounded-sm bg-sunken text-ink-3"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      >
        {values.length > 1 ? (
          <polyline
            fill="none"
            points={polyline(values)}
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
    </div>
  )
}
