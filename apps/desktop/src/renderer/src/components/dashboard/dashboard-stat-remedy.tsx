import type { ReactNode } from "react";

/**
 * What to do about a figure that crossed its line, under the gauge that says
 * so. A tinted bar names the problem; this names the way out, with the gesture
 * that takes it, so the alert is never a colour the reader has to interpret.
 */
export function DashboardStatRemedy({
  text,
  actions,
  name,
}: {
  text: string;
  actions: ReactNode;
  /** What the remedy is about, for whoever has to find it. */
  name: string;
}) {
  return (
    <div
      className="mt-3 flex flex-col gap-2 border-line border-t pt-3"
      data-remedy={name}
    >
      <p className="text-[12px] text-ink-2 leading-relaxed">{text}</p>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
