import type { ReactNode } from "react";

// The system draws its window buttons here (left on macOS, right elsewhere), so keep both corners empty.
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
