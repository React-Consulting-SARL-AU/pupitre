import { developmentNotice, isPublicStage } from "@pupitre/shared/legal"
import { useLocale } from "@/hooks/use-locale"

/** One line over every page of the console, signed in or not, until the project is public. */
export function DevelopmentBanner() {
  const { locale } = useLocale()

  if (isPublicStage()) {
    return null
  }

  const notice = developmentNotice(locale)

  return (
    <p
      className="border-line border-b bg-raised px-4 py-2 text-center text-[12px] text-ink-2"
      role="status"
    >
      <span className="mr-2 rounded-full border border-line px-2 py-[1px] font-medium text-[10.5px] text-ink uppercase tracking-[0.08em]">
        {notice.label}
      </span>
      {notice.banner}
    </p>
  )
}
