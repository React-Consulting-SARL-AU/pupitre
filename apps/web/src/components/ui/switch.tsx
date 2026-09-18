import { Switch as BaseSwitch } from "@base-ui-components/react/switch"
import { Label } from "@/components/ui/label"

export interface SwitchProps {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function Switch({ id, label, checked, onCheckedChange }: SwitchProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <BaseSwitch.Root
        checked={checked}
        className="flex h-9 w-14 items-center rounded-full border border-line-strong bg-sunken px-1 transition-fast focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 data-[checked]:bg-inverse"
        id={id}
        onCheckedChange={onCheckedChange}
      >
        <BaseSwitch.Thumb className="size-6 rounded-full bg-ink transition-fast data-[checked]:translate-x-5 data-[checked]:bg-inverse-ink" />
      </BaseSwitch.Root>
    </div>
  )
}
