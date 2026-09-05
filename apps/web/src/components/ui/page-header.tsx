import type { ReactNode } from "react"
import { useTranslations } from "@/hooks/use-locale"
import type { DictionaryKey } from "@/lib/i18n/en"

export interface PageHeaderProps {
  title: string
  parents?: DictionaryKey[]
  description?: string
  actions?: ReactNode
}

export function PageHeader({
  title,
  parents = [],
  description,
  actions,
}: PageHeaderProps) {
  const t = useTranslations()

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-gutter">
      <div className="space-y-1">
        {parents.length > 0 ? (
          <nav
            aria-label={t("nav.breadcrumb")}
            className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]"
          >
            {parents.map((parent) => t(parent)).join(" · ")}
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
