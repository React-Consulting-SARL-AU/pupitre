import type { ReactNode } from "react";

export function DashboardStatRemedy({
  text,
  actions,
  name,
}: {
  text: string;
  actions: ReactNode;
  name: string;
}) {
  return (
    <div
      className="mt-3 flex flex-col gap-2 border-line border-t pt-3"
      data-remedy={name}
    >
      <p className="text-ink-2 text-small leading-relaxed">{text}</p>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
