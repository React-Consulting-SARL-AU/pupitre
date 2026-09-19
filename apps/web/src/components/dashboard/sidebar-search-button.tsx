import { Search } from "lucide-react"
import { useEffect, useState } from "react"
import {
  SIDEBAR_ICON_CLASS,
  SIDEBAR_ITEM_CLASS,
} from "@/components/dashboard/sidebar-link"
import { Kbd } from "@/components/ui/kbd"
import { useTranslations } from "@/hooks/use-locale"
import { askForPlatformSearch } from "@/lib/domain/admin-search"
import { SHORTCUT_MODIFIERS, shortcutModifier } from "@/lib/domain/chrome"
import { cn } from "@/lib/utils/cn"

const SHORTCUT_LETTER = "K"

/** The same dialog as the keyboard shortcut, for whoever reaches for the mouse. */
export function SidebarSearchButton() {
  const t = useTranslations()
  // The server knows no keyboard: the modifier lands once the browser has it.
  const [modifier, setModifier] = useState<string>(SHORTCUT_MODIFIERS.other)
  const label = t("admin.search.title")

  useEffect(() => {
    setModifier(shortcutModifier(navigator.userAgent))
  }, [])

  return (
    <button
      aria-label={label}
      className={cn(SIDEBAR_ITEM_CLASS, "w-full")}
      onClick={askForPlatformSearch}
      title={label}
      type="button"
    >
      <Search className={SIDEBAR_ICON_CLASS} strokeWidth={1.5} />
      <span className="truncate">{label}</span>
      <Kbd className="ml-auto">{`${modifier}${SHORTCUT_LETTER}`}</Kbd>
    </button>
  )
}
