import { Label } from "@renderer/components/ui/label";
import { Panel } from "@renderer/components/ui/panel";
import type { ComponentType, ReactNode } from "react";
import { DashboardStatGauge } from "./dashboard-stat-gauge";

export function DashboardStat({
  title,
  value,
  detail,
  share,
  alert = false,
  remedy,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  /** Absent: the figure has no ceiling to be read against. */
  share?: number;
  alert?: boolean;
  /** What to do about the alert; drawn only while there is one. */
  remedy?: ReactNode;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <Panel className="transition-soft" data-alert={alert ? "true" : undefined}>
      <p className="flex items-center gap-1.5 text-ink-3">
        <Icon size={12} strokeWidth={1.5} />
        <Label>{title}</Label>
      </p>
      <p className="mt-1.5 font-semibold text-ink text-xl tabular-nums tracking-tight">
        {value}
      </p>
      <p className="font-data text-[12px] text-ink-3">{detail}</p>
      {share === undefined ? null : (
        <DashboardStatGauge alert={alert} share={share} />
      )}
      {alert ? remedy : null}
    </Panel>
  );
}
