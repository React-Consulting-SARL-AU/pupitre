import type { ReactNode } from "react";

/**
 * A small figure beside a caption — how many are moving, which device is this
 * one. It never wraps or shrinks: a count split over two lines reads as two.
 */
export function CountPill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-line px-1.5 py-0.5 font-data text-caption text-ink-3 tabular-nums leading-none ${className}`}
    >
      {children}
    </span>
  );
}
