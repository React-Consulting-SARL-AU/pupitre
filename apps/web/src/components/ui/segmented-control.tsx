import { cn } from "@/lib/utils/cn"

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-1 rounded-sm border border-line-strong bg-sunken p-1",
        className
      )}
    >
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            "h-7 rounded-sm px-3 text-[13px] transition-fast",
            "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
            value === option.value
              ? "bg-inverse text-inverse-ink"
              : "text-ink-2 hover:bg-raised hover:text-ink"
          )}
          key={option.value}
          onClick={() => {
            onValueChange(option.value)
          }}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
