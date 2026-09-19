import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils/cn"

export interface CheckboxProps {
  /** What ticking it selects, for the screen reader that never sees the row. */
  label: string
  checked: boolean
  indeterminate?: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}

export function Checkbox({
  label,
  checked,
  indeterminate = false,
  onCheckedChange,
  className,
}: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      aria-label={label}
      checked={checked}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-xs border border-line-strong bg-sunken transition-fast",
        "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
        "data-[checked]:border-ink data-[checked]:bg-inverse",
        "data-[indeterminate]:border-ink data-[indeterminate]:bg-inverse",
        className
      )}
      indeterminate={indeterminate}
      onCheckedChange={onCheckedChange}
    >
      <BaseCheckbox.Indicator className="flex text-inverse-ink">
        {indeterminate ? (
          <Minus className="size-3" strokeWidth={2} />
        ) : (
          <Check className="size-3" strokeWidth={2} />
        )}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}
