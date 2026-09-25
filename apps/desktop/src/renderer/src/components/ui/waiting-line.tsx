import type { ReactNode } from "react";
import { StatusDot } from "./status-dot";

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
