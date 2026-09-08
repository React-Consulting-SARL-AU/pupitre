import { Link } from "@tanstack/react-router"
import { ArrowRight, Download } from "lucide-react"
import { buttonClassName } from "@/components/ui/button"
import { useTranslations } from "@/hooks/use-locale"
import { useSuggestedOffer } from "@/hooks/use-suggested-offer"

export function SidebarAppCard() {
  const t = useTranslations()
  const { published, offer } = useSuggestedOffer()

  return (
    <div className="rounded-md border border-line bg-sunken p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12px] text-ink">
          {t("download.appTitle")}
        </p>
        <span className="shrink-0 font-data text-[11px] text-ink-3 tabular-nums">
          {published ? published.version : t("sidebar.app.unpublished")}
        </span>
      </div>

      {offer?.url ? (
        <a
          className={buttonClassName({
            variant: "primary",
            size: "sm",
            className: "mt-2.5 w-full",
          })}
          href={offer.url}
        >
          <Download className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">
            {t("download.get", { system: t(offer.label) })}
          </span>
        </a>
      ) : null}

      <Link
        className="mt-2 flex items-center gap-1.5 rounded-sm text-[12px] text-ink-3 transition-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
        to="/dashboard/download"
      >
        {t("sidebar.app.all")}
        <ArrowRight className="size-3.5" strokeWidth={1.5} />
      </Link>
    </div>
  )
}
