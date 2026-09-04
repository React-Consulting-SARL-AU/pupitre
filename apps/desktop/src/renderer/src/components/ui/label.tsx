import type { ReactNode } from "react";

/** The uppercase, letter-spaced caption of the design system. */
export function Label({ children }: { children: ReactNode }) {
  return <span className="label shrink-0 text-ink-3">{children}</span>;
}
