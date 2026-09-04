import { Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"

export interface SidebarLinkProps {
  to: string
  label: string
  icon: LucideIcon
}

export function SidebarLink({ to, label, icon: Icon }: SidebarLinkProps) {
  return (
    <Link
      activeOptions={{ exact: false }}
      activeProps={{
        className:
          "bg-raised text-ink before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-ink",
      }}
      className="relative flex items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-ink-2 transition-colors duration-[120ms] ease-[ease] hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
      to={to}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.5} />
      {label}
    </Link>
  )
}
