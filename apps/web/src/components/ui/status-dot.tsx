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
  /** Left out when a visible label beside the dot already says the state. */
  label?: string
  className?: string
}

export function StatusDot({ shape, tone, label, className }: StatusDotProps) {
  const drawing = (
    <>
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
    </>
  )
  const classes = cn("size-[12px] shrink-0", TONES[tone], className)

  if (!label) {
    return (
      <svg
        aria-hidden="true"
        className={classes}
        data-shape={shape}
        data-testid="status-dot"
        viewBox="0 0 12 12"
      >
        {drawing}
      </svg>
    )
  }

  return (
    <svg
      className={classes}
      data-shape={shape}
      data-testid="status-dot"
      role="img"
      viewBox="0 0 12 12"
    >
      <title>{label}</title>
      {drawing}
    </svg>
  )
}
