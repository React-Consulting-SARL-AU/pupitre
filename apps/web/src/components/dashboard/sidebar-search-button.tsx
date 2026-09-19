import { Search } from "lucide-react"
import { useTranslations } from "@/hooks/use-locale"
import { askForPlatformSearch } from "@/lib/domain/admin-search"

/** The same dialog as Cmd+K, for whoever reaches for the mouse. */
export function SidebarSearchButton() {
  const t = useTranslations()
  const label = t("admin.search.title")

  return (
    <button
      aria-label={label}
      className="group flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink-2 transition-fast hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
      onClick={askForPlatformSearch}
      title={label}
      type="button"
    >
      <Search
        className="size-4 shrink-0 text-ink-3 transition-fast group-hover:text-ink-2"
        strokeWidth={1.5}
      />
      <span className="truncate">{label}</span>
      <span className="ml-auto font-data text-[10.5px] text-ink-3">⌘K</span>
    </button>
  )
}
