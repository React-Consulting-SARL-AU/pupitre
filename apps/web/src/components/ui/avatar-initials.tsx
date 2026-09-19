import { cn } from "@/lib/utils/cn"

export interface AvatarInitialsProps {
  initials: string
  label: string
  className?: string
}

/** Two letters where a face would be: nobody uploads one, and a blank circle says nothing. */
export function AvatarInitials({
  initials,
  label,
  className,
}: AvatarInitialsProps) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken font-data text-[11px] text-ink-2",
        className
      )}
      title={label}
    >
      <span aria-hidden="true">{initials}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
