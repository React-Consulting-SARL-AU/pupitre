import { Spinner } from "@/components/ui/spinner"

export interface LoadingStateProps {
  label: string
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 px-4 py-6 text-[13px] text-ink-3"
    >
      <Spinner size={16} />
      {label}
    </p>
  )
}
