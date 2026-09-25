import { Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"

export const SIDEBAR_ITEM_CLASS =
  "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink-2 transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"

export const SIDEBAR_ICON_CLASS =
  "size-4 shrink-0 text-ink-3 transition-fast group-hover:text-ink-2"

export interface SidebarLinkProps {
  to: string
  label: string
  icon: LucideIcon
  exact?: boolean
  badge?: number
}

export function SidebarLink({
  to,
  label,
  icon: Icon,
  exact = false,
  badge,
}: SidebarLinkProps) {
  return (
    <Link
      activeOptions={{ exact }}
      activeProps={{ className: "bg-raised font-medium text-ink" }}
      className={SIDEBAR_ITEM_CLASS}
      to={to}
    >
      <Icon className={SIDEBAR_ICON_CLASS} strokeWidth={1.5} />
      <span className="truncate">{label}</span>
      {badge && badge > 0 ? (
        <span className="ml-auto shrink-0 rounded-full bg-inverse px-1.5 font-data text-[11px] text-inverse-ink tabular-nums">
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
