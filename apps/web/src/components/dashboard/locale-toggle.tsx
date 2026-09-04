import { LOCALES, type Locale } from "@pupitre/shared/i18n"
import { useQueryClient } from "@tanstack/react-query"
import { Languages } from "lucide-react"
import {
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { updateLocale } from "@/lib/api/queries"
import { LOCALE_LABELS } from "@/lib/domain/locales"

export function LocaleToggle() {
  const { user } = useDashboardContext()
  const queryClient = useQueryClient()
  const save = useRequestCycle()

  const choose = (value: string) =>
    save.run(async () => {
      await updateLocale(value as Locale)
      await queryClient.invalidateQueries()
    })

  return (
    <div className="flex flex-col items-end gap-1">
      <MenuRoot>
        <MenuTrigger
          aria-label="Choisir la langue"
          className="flex items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-ink-2 transition-colors duration-[120ms] ease-[ease] hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          disabled={save.phase === "pending"}
        >
          <Languages className="size-4" strokeWidth={1.5} />
          {LOCALE_LABELS[user.locale]}
        </MenuTrigger>
        <MenuPopup>
          <MenuGroup>
            <MenuGroupLabel>Langue</MenuGroupLabel>
            <MenuRadioGroup
              onValueChange={(value) => {
                choose(value)
              }}
              value={user.locale}
            >
              {LOCALES.map((candidate) => (
                <MenuRadioItem key={candidate} value={candidate}>
                  {LOCALE_LABELS[candidate]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        </MenuPopup>
      </MenuRoot>
      {save.error ? (
        <span className="text-[12px] text-danger">{save.error}</span>
      ) : null}
    </div>
  )
}
