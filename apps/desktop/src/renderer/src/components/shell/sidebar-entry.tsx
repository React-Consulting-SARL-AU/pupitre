import type { ReactNode } from "react";

/**
 * One entry of the sidebar, in the second and third planes of the menu.
 *
 * The entries are `ink`; the active one sits on `raised` and carries a marker
 * on its left — the plane that says "you are here" without a colour doing the
 * work alone.
 */
export function SidebarEntry({
  active,
  onClick,
  children,
  bullet,
  beforeSuffix,
  suffix,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  bullet?: ReactNode;
  beforeSuffix?: ReactNode;
  suffix?: ReactNode;
}) {
  return (
    <div
      className={`group relative flex w-full items-center gap-2 rounded-sm pr-1.5 transition-soft ${
        active ? "bg-raised" : "hover:bg-sunken"
      }`}
      data-active={active}
    >
      <span
        aria-hidden="true"
        className={`absolute top-2 bottom-2 left-0 w-0.5 rounded-full transition-soft ${
          active ? "bg-ink" : "bg-transparent"
        }`}
      />
      <button
        className={`flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-1 pl-3 text-left text-[12px] transition-soft ${
          active ? "font-medium text-ink" : "text-ink-2 group-hover:text-ink"
        }`}
        onClick={onClick}
        type="button"
      >
        {bullet}
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
      {beforeSuffix}
      {suffix}
    </div>
  );
}
