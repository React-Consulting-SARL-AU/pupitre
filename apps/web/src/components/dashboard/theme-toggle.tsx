import type { LucideIcon } from "lucide-react"
import { Monitor, Moon, Sun } from "lucide-react"
import {
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import { useTheme } from "@/hooks/use-theme"
import { THEME_LABELS, THEMES, type Theme } from "@/lib/theme"

const ICONS: Record<Theme, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const Icon = ICONS[theme]

  return (
    <MenuRoot>
      <MenuTrigger
        aria-label="Choisir le thème"
        className="flex items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-ink-2 transition-colors duration-[120ms] ease-[ease] hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
      >
        <Icon className="size-4" strokeWidth={1.5} />
        {THEME_LABELS[theme]}
      </MenuTrigger>
      <MenuPopup>
        <MenuGroup>
          <MenuGroupLabel>Thème</MenuGroupLabel>
          <MenuRadioGroup
            onValueChange={(value) => {
              setTheme(value as Theme)
            }}
            value={theme}
          >
            {THEMES.map((candidate) => {
              const CandidateIcon = ICONS[candidate]

              return (
                <MenuRadioItem key={candidate} value={candidate}>
                  <CandidateIcon
                    className="size-4 text-ink-3"
                    strokeWidth={1.5}
                  />
                  {THEME_LABELS[candidate]}
                </MenuRadioItem>
              )
            })}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </MenuRoot>
  )
}
