import type { LucideIcon } from "lucide-react"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import { cn } from "@/lib/utils/cn"

export interface RowAction {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  tone?: "danger"
  disabled?: boolean
}

export interface RowActionsMenuProps {
  /** What the menu acts on, for the screen reader that never sees the row. */
  label: string
  actions: RowAction[]
}

export function RowActionsMenu({ label, actions }: RowActionsMenuProps) {
  if (actions.length === 0) {
    return null
  }

  return (
    <MenuRoot>
      <MenuTrigger
        render={
          <Button
            aria-label={label}
            className="w-7 px-0"
            icon={MoreHorizontal}
            size="sm"
            title={label}
            variant="ghost"
          />
        }
      />
      <MenuPopup align="end">
        {actions.map((action) => (
          <MenuItem
            className={cn(action.tone === "danger" && "text-danger")}
            disabled={action.disabled}
            key={action.label}
            onClick={action.onSelect}
          >
            {action.icon ? (
              <action.icon className="size-4 shrink-0" strokeWidth={1.5} />
            ) : null}
            {action.label}
          </MenuItem>
        ))}
      </MenuPopup>
    </MenuRoot>
  )
}
