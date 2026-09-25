import { StatusBadge } from "@/components/ui/status-badge"
import type { StatusLook } from "@/lib/domain/server-status"

export interface StatusRowProps {
  label: string
  look: StatusLook
  detail?: string
}

export function StatusRow({ label, look, detail }: StatusRowProps) {
  return (
    <li className="flex items-center gap-3 border-line border-b px-4 py-3 last:border-b-0">
      <span className="flex-1 text-[14px] text-ink">{label}</span>
      <StatusBadge look={look} />
      {detail ? (
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {detail}
        </span>
      ) : null}
    </li>
  )
}
