import { Link, type LinkProps } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"

/**
 * A destination named by the card rather than written in place: the router
 * cannot resolve one search shape for five different lists, so the card holds it.
 */
export interface WorklistLink {
  to: string
  params?: Record<string, string>
  search?: Record<string, string | boolean>
}

export interface WorklistEntry {
  id: string
  /** Where the line takes the reader; the whole line is that link. */
  to: WorklistLink
  primary: string
  secondary?: string
}

export interface AdminWorklistCardProps {
  title: string
  icon: LucideIcon
  count: number
  entries: WorklistEntry[]
  seeAll: WorklistLink
  emptyLabel: string
}

function linkProps(link: WorklistLink): LinkProps {
  return link as LinkProps
}

export function AdminWorklistCard({
  title,
  icon: Icon,
  count,
  entries,
  seeAll,
  emptyLabel,
}: AdminWorklistCardProps) {
  const t = useTranslations()
  let body: ReactNode = (
    <p className="px-4 py-3 text-[13px] text-ink-3">{emptyLabel}</p>
  )

  if (entries.length > 0) {
    body = (
      <ul>
        {entries.map((entry) => (
          <li className="border-line border-b last:border-b-0" key={entry.id}>
            <Link
              {...linkProps(entry.to)}
              className="block px-4 py-2.5 transition-fast hover:bg-raised focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
            >
              <span className="block truncate text-[13px] text-ink">
                {entry.primary}
              </span>
              {entry.secondary ? (
                <span className="block truncate font-data text-[12px] text-ink-3">
                  {entry.secondary}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-ink-3" strokeWidth={1.5} />
          {title}
        </CardTitle>
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {count}
        </span>
      </CardHeader>

      <div className="flex-1">{body}</div>

      {count > 0 ? (
        <div className="border-line border-t px-4 py-2.5">
          <Link
            {...linkProps(seeAll)}
            className="text-[13px] text-ink-2 underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          >
            {t("admin.worklists.seeAll")}
          </Link>
        </div>
      ) : null}
    </Card>
  )
}
