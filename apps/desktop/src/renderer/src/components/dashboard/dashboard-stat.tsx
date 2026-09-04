import { Label } from "@renderer/components/ui/label";
import type { ComponentType } from "react";

/** A horizontal gauge. The tone says nothing the bar does not say already. */
function Gauge({ share, alert }: { share: number; alert: boolean }) {
  return (
    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-sunken">
      <div
        className={`h-full rounded-full transition-size ${alert ? "bg-warn" : "bg-ink-3"}`}
        style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
      />
    </div>
  );
}

export function DashboardStat({
  title,
  value,
  detail,
  share,
  alert = false,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  /** Absent: the figure has no ceiling to be read against. */
  share?: number;
  alert?: boolean;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <div className="elevation-raised rounded-md border border-line bg-surface p-4 transition-soft">
      <p className="flex items-center gap-1.5 text-ink-3">
        <Icon size={12} strokeWidth={1.5} />
        <Label>{title}</Label>
      </p>
      <p className="mt-1.5 font-semibold text-ink text-xl tabular-nums tracking-tight">
        {value}
      </p>
      <p className="font-data text-[11px] text-ink-3">{detail}</p>
      {share === undefined ? null : <Gauge alert={alert} share={share} />}
    </div>
  );
}
