import { Download } from "lucide-react"
import { buttonClassName } from "@/components/ui/button"
import { useTranslations } from "@/hooks/use-locale"
import type { DownloadOffer } from "@/lib/domain/downloads"

export interface DownloadOfferRowProps {
  offer: DownloadOffer
  suggested: boolean
}

export function DownloadOfferRow({ offer, suggested }: DownloadOfferRowProps) {
  const t = useTranslations()
  const system = t(offer.label)

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium text-[13px] text-ink">
          {system}
          {suggested ? (
            <span className="rounded-full bg-raised px-2 py-[2px] text-[10.5px] text-ink-2 uppercase tracking-[0.08em]">
              {t("download.yourSystem")}
            </span>
          ) : null}
        </p>
        <p className="text-[13px] text-ink-3">
          {t(offer.format)} · {t(offer.requirement)}
          {offer.arch ? ` · ${offer.arch}` : ""}
        </p>
      </div>

      {offer.url ? (
        <a
          className={buttonClassName({
            variant: suggested ? "primary" : "secondary",
          })}
          href={offer.url}
        >
          <Download className="size-4" strokeWidth={1.5} />
          {t("download.get", { system })}
        </a>
      ) : (
        <span className="text-[13px] text-ink-3">
          {t("download.notPublished")}
        </span>
      )}
    </li>
  )
}
