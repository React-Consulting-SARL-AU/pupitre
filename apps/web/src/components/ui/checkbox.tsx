import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils/cn"

export interface CheckboxProps {
  id?: string
  checked: boolean
  indeterminate?: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  /** The hover bubble, when it says more than the label — a keyboard shortcut, say. */
  title?: string
  className?: string
  disabled?: boolean
}

/** A square the size of a row: the label is carried by `aria-label`, never printed. */
export function Checkbox({
  id,
  checked,
  indeterminate = false,
  onCheckedChange,
  label,
  title,
  className,
  disabled = false,
}: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      aria-label={label}
      checked={checked}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-sunken transition-fast",
        "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
        "data-[checked]:border-ink data-[checked]:bg-inverse",
        "data-[indeterminate]:border-ink data-[indeterminate]:bg-inverse",
        className
      )}
      disabled={disabled}
      id={id}
      indeterminate={indeterminate}
      onCheckedChange={onCheckedChange}
      title={title ?? label}
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
