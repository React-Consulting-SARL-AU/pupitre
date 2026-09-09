import {
  CircleCheck,
  Info,
  type LucideIcon,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react"
import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

export type CalloutTone = "neutral" | "info" | "warn" | "danger" | "ok"

export interface CalloutProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: CalloutTone
  title: string
  fix?: string | null
  action?: ReactNode
  children?: ReactNode
}

const ICONS: Record<CalloutTone, LucideIcon> = {
  neutral: Info,
  info: Info,
  warn: TriangleAlert,
  danger: OctagonAlert,
  ok: CircleCheck,
}

const ICON_TONES: Record<CalloutTone, string> = {
  neutral: "text-ink-3",
  info: "text-ink-3",
  warn: "text-warn",
  danger: "text-danger",
  ok: "text-ok",
}

const COMMAND_START = /^[a-z/~$]/

function looksLikeCommand(fix: string): boolean {
  return COMMAND_START.test(fix) && !fix.endsWith(".")
}

function remedy(fix: string): ReactNode {
  if (looksLikeCommand(fix)) {
    return (
      <code className="mt-1.5 inline-block rounded-sm bg-sunken px-2 py-1 font-data text-[12px] text-ink-2">
        {fix}
      </code>
    )
  }

  return <p className="mt-1 text-ink-2">{fix}</p>
}

export function Callout({
  tone = "neutral",
  title,
  fix,
  action,
  children,
  className,
  ...props
}: CalloutProps) {
  const Icon = ICONS[tone]

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-line bg-surface px-3.5 py-3 text-[13px] shadow-raised",
        className
      )}
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-4 shrink-0", ICON_TONES[tone])}
        strokeWidth={1.5}
      />

      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>

        {fix ? remedy(fix) : null}

        {children}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
