import type { ReactNode } from "react";
import { StatusDot } from "./status-dot";

/**
 * A wait that fits on one line, next to what it is waiting for.
 *
 * The card of `WaitingNotice` is for a screen that has nothing else to show;
 * this is for a panel that still has its frame, its title and its neighbours,
 * and only wants the reader told that one thing is on its way.
 */
export function WaitingLine({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-busy="true"
      className={`inline-flex items-center gap-2 text-ink-3 ${className}`}
      role="status"
    >
      <StatusDot shape="breathing" size={11} />
      {children}
    </span>
  );
}
