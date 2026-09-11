import type { ReactNode } from "react";

/**
 * One row of tabs, whatever the language.
 *
 * No overflow rule: the pixel the active tab pulls over the border would grow
 * a scrollbar out of it, and a bar on two lines reads as two bars.
 */
export function TabBar({ children }: { children: ReactNode }) {
  return <div className="flex gap-0.5 border-line border-b">{children}</div>;
}

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px] transition-soft ${
        active
          ? "border-ink font-medium text-ink"
          : "border-transparent text-ink-3 hover:text-ink"
      }`}
      data-active={active ? "true" : undefined}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
