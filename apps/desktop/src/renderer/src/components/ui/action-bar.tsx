import { STEP_COLUMN } from "@renderer/lib/layout";
import type { ReactNode } from "react";

export function ActionBar({
  name,
  note,
  tone = "neutral",
  column = true,
  children,
}: {
  name: string;
  note?: ReactNode;
  tone?: "neutral" | "danger";
  column?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 mt-2 w-full border-line border-t bg-surface py-3"
      data-actions={name}
    >
      <div
        className={`${column ? STEP_COLUMN : "px-8"} flex flex-wrap items-center justify-between gap-3`}
      >
        <div
          className={`min-w-0 flex-1 text-small ${tone === "danger" ? "text-danger" : "text-ink-3"}`}
        >
          {note}
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
