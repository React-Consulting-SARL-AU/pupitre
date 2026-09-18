import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "@/hooks/use-locale"

export interface AdminSearchFormProps {
  id: string
  placeholder: string
  query: string
  onSearch: (query: string) => void
}

/** The search leaves on Enter or on the button, never on each keystroke: a platform-wide query is not free. */
export function AdminSearchForm({
  id,
  placeholder,
  query,
  onSearch,
}: AdminSearchFormProps) {
  const t = useTranslations()

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault()

        const typed = new FormData(event.currentTarget).get("q")

        onSearch(typeof typed === "string" ? typed.trim() : "")
      }}
    >
      <div className="flex min-w-[240px] flex-1 flex-col gap-2 sm:max-w-[360px]">
        <Label htmlFor={id}>{t("admin.search")}</Label>
        <Input
          autoComplete="off"
          defaultValue={query}
          id={id}
          name="q"
          placeholder={placeholder}
          type="search"
        />
      </div>
      <Button icon={Search} type="submit">
        {t("admin.searchAction")}
      </Button>
    </form>
  )
}
