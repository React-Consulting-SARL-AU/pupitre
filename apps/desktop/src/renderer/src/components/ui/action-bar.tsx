import type { ReactNode } from "react";

/**
 * The bar a screen ends on, held at the bottom of it.
 *
 * The last thing read is the last field, so the gesture that follows belongs
 * there and not in a header the reader left three screens ago. What stands in
 * the way of that gesture is said on the left, at the height of the button
 * rather than in a notice at the top of the page.
 */
export function ActionBar({
  note,
  children,
}: {
  /** What blocks the action, or what it is about to do. Read at the height of the button. */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-8 mt-2 border-line border-t bg-surface px-8 py-3"
      data-testid="config-actions"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-[12px] text-ink-3">{note}</div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
