import { Link, useRouterState } from "@tanstack/react-router"
import { type ReactNode, useEffect, useRef } from "react"
import { useTranslations } from "@/hooks/use-locale"
import type { Crumb } from "@/lib/domain/page-titles"

export interface PageHeaderProps {
  title: string
  parents?: Crumb[]
  description?: string
  actions?: ReactNode
  /** A skeleton stands in for a page: the focus waits for the page itself. */
  pending?: boolean
}

/** Each page mounts its own header, so the page it replaces is remembered outside it. */
let lastPathname: string | null = null

export function PageHeader({
  title,
  parents = [],
  description,
  actions,
  pending = false,
}: PageHeaderProps) {
  const t = useTranslations()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const settled = useRouterState({ select: (state) => state.status === "idle" })
  const heading = useRef<HTMLHeadingElement>(null)
  // The page being left reads the new pathname too: only the header mounted on
  // it, once the navigation has settled, is the one the reader has arrived at.
  const mountedOn = useRef(pathname)

  useEffect(() => {
    if (pending || !settled || pathname !== mountedOn.current) {
      return
    }

    const arrived = lastPathname !== null && lastPathname !== pathname

    lastPathname = pathname

    if (arrived) {
      heading.current?.focus({ preventScroll: true })
    }
  }, [pathname, pending, settled])

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-gutter">
      <div className="space-y-1">
        {parents.length > 0 ? (
          <nav aria-label={t("nav.breadcrumb")}>
            <ol className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {parents.map((crumb, index) => (
                <li className="flex items-center gap-1.5" key={crumb.to}>
                  {index === 0 ? null : (
                    <span aria-hidden="true" className="text-ink-3">
                      ·
                    </span>
                  )}
                  <Link
                    className="transition-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
                    to={crumb.to}
                  >
                    {t(crumb.title)}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1
          className="font-bold font-display text-[22px] text-ink leading-[1.2] tracking-[-0.01em] outline-none"
          ref={heading}
          tabIndex={-1}
        >
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
