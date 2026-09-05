import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

export type CalloutTone = "neutral" | "danger"

export interface CalloutProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: CalloutTone
  title: string
  fix?: string | null
}

const TONES: Record<CalloutTone, string> = {
  neutral: "text-ink",
  danger: "text-danger",
}

export function Callout({
  tone = "neutral",
  title,
  fix,
  className,
  ...props
}: CalloutProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-sunken px-3.5 py-2.5 text-[13px]",
        className
      )}
      role="alert"
      {...props}
    >
      <p className={TONES[tone]}>{title}</p>
      {fix ? <p className="mt-1 text-ink-2">{fix}</p> : null}
    </div>
  )
}
