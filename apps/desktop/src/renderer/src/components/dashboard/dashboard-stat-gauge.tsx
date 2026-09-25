export function DashboardStatGauge({
  share,
  alert,
}: {
  share: number;
  alert: boolean;
}) {
  return (
    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-sunken">
      <div
        className={`h-full rounded-full transition-size ${alert ? "bg-warn" : "bg-ink-3"}`}
        style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
      />
    </div>
  );
}
