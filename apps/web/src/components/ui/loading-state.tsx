export interface LoadingStateProps {
  label: string
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 px-4 py-6 text-[13px] text-ink-3"
    >
      <span
        aria-hidden="true"
        className="size-[10px] animate-breathe rounded-full bg-ink-3"
      />
      {label}
    </p>
  )
}
