import { Select as BaseSelect } from "@base-ui-components/react/select"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils/cn"

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  id?: string
  value: string
  onValueChange: (value: string) => void
  items: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function Select({
  id,
  value,
  onValueChange,
  items,
  placeholder,
  className,
  disabled = false,
}: SelectProps) {
  return (
    <BaseSelect.Root
      disabled={disabled}
      onValueChange={(next) => {
        onValueChange(next ?? "")
      }}
      value={value}
    >
      <BaseSelect.Trigger
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-sunken px-3.5 text-[13px] text-ink",
          "transition-fast",
          "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
          "disabled:text-ink-4",
          className
        )}
        id={id}
      >
        <BaseSelect.Value className="truncate">
          {(selected: string | null) =>
            items.find((item) => item.value === selected)?.label ??
            placeholder ??
            ""
          }
        </BaseSelect.Value>
        <BaseSelect.Icon className="flex">
          <ChevronsUpDown
            className="size-4 shrink-0 text-ink-3"
            strokeWidth={1.5}
          />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner align="start" sideOffset={6}>
          <BaseSelect.Popup className="min-w-[220px] rounded-lg bg-surface p-1 shadow-overlay outline-none">
            <BaseSelect.List>
              {items.map((item) => (
                <BaseSelect.Item
                  className="flex cursor-default select-none items-center gap-2 rounded-full px-3 py-2 text-[13px] text-ink outline-none data-[highlighted]:bg-raised"
                  key={item.value}
                  value={item.value}
                >
                  <BaseSelect.ItemText className="truncate">
                    {item.label}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="ml-auto flex">
                    <Check className="size-4 text-ink" strokeWidth={1.5} />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
