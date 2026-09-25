import type { ReactNode } from "react";

export function Label({ children }: { children: ReactNode }) {
  return <span className="label shrink-0 text-ink-3">{children}</span>;
}
