import type { StatusShape, StatusTone } from "@/lib/domain/server-status"
import { cn } from "@/lib/utils/cn"

const TONES: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-ink-3",
}

export interface StatusDotProps {
  shape: StatusShape
  tone: StatusTone
  label: string
  className?: string
}

export function StatusDot({ shape, tone, label, className }: StatusDotProps) {
  return (
    <svg
      className={cn("size-[12px] shrink-0", TONES[tone], className)}
      data-shape={shape}
      data-testid="status-dot"
      role="img"
      viewBox="0 0 12 12"
    >
      <title>{label}</title>
      <circle
        className={shape === "breathing" ? "animate-breathe" : undefined}
        cx="6"
        cy="6"
        fill={
          shape === "filled" || shape === "breathing" ? "currentColor" : "none"
        }
        r="3.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {shape === "barred" ? (
        <line
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
          x1="1.75"
          x2="10.25"
          y1="10.25"
          y2="1.75"
        />
      ) : null}
    </svg>
  )
}
