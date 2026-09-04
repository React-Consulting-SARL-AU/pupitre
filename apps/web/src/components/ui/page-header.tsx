import type { ReactNode } from "react"

export interface PageHeaderProps {
  title: string
  parents?: string[]
  description?: string
  actions?: ReactNode
}

export function PageHeader({
  title,
  parents = [],
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-gutter">
      <div className="space-y-1">
        {parents.length > 0 ? (
          <nav
            aria-label="Fil d'Ariane"
            className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]"
          >
            {parents.join(" · ")}
          </nav>
        ) : null}
        <h1 className="font-bold font-display text-[22px] text-ink leading-[1.2] tracking-[-0.01em]">
          {title}
        </h1>
        {description ? (
          <p className="text-[13px] text-ink-2">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
