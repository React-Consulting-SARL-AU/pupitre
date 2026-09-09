import { STEP_COLUMN } from "@renderer/lib/layout";
import type { ReactNode } from "react";

/**
 * The bar a screen ends on, held at the bottom of it.
 *
 * The last thing read is the last field, so the gesture that follows belongs
 * there and not in a header the reader left three screens ago. What stands in
 * the way of that gesture is said on the left, at the height of the button
 * rather than in a notice at the top of the page. The bar runs from edge to
 * edge of the panel; what it holds lines up with the column above it.
 */
export function ActionBar({
  name,
  note,
  tone = "neutral",
  children,
}: {
  /** Which screen's bar this is, for whoever has to find it. */
  name: string;
  /** What blocks the action, or what it is about to do. Read at the height of the button. */
  note?: ReactNode;
  /** `danger` when the note says why the main gesture cannot be made. */
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 mt-2 w-full border-line border-t bg-surface py-3"
      data-actions={name}
    >
      <div
        className={`${STEP_COLUMN} flex flex-wrap items-center justify-between gap-3`}
      >
        <div
          className={`min-w-0 flex-1 text-[12px] ${tone === "danger" ? "text-danger" : "text-ink-3"}`}
        >
          {note}
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
