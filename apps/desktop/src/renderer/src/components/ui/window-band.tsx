import type { ReactNode } from "react";

/**
 * The strip the window is dragged by, and the one its system draws its own
 * buttons in.
 *
 * macOS puts them at the left of it, Windows and Linux at the right, so nothing
 * of ours goes in either corner: a screen that starts at the top of the window
 * starts below this band, and what it does put in the band sits in the middle
 * of a panel rather than at an edge of the window.
 */
export function WindowBand({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`draggable flex h-10 shrink-0 items-center ${className}`}>
      {children}
    </div>
  );
}
