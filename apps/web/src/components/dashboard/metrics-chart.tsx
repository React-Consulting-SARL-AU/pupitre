const VIEW_WIDTH = 100
const VIEW_HEIGHT = 30

export interface MetricsChartProps {
  label: string
  values: number[]
  latest: number | null
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

export function MetricsChart({ label, values, latest }: MetricsChartProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {label}
        </span>
        <span className="font-data text-[12px] text-ink tabular-nums">
          {latest === null ? "—" : `${Math.round(latest)} %`}
        </span>
      </div>
      <svg
        aria-hidden="true"
        className="h-[48px] w-full rounded-sm bg-sunken text-ink-3"
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
