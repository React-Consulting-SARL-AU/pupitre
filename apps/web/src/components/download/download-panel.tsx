import { useQuery } from "@tanstack/react-query"
import { PackageOpen } from "lucide-react"
import { DownloadOfferRow } from "@/components/download/download-offer-row"
import { LinkAppCard } from "@/components/download/link-app-card"
import { ReleaseNotesCard } from "@/components/download/release-notes-card"
import { RequirementsCard } from "@/components/download/requirements-card"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { useTranslations } from "@/hooks/use-locale"
import { latestAppReleaseQueryOptions } from "@/lib/api/queries"
import { detectOs, downloadOffers } from "@/lib/domain/downloads"
import type { DictionaryKey } from "@/lib/i18n/en"

const JOURNEY: DictionaryKey[] = [
  "download.journey.download",
  "download.journey.link",
  "download.journey.enrol",
]

function currentUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

export function DownloadPanel() {
  const t = useTranslations()
  const release = useQuery(latestAppReleaseQueryOptions())

  if (release.isPending) {
    return <LoadingState label={t("download.reading")} />
  }

  if (release.isError) {
    return (
      <Callout
        fix={t("download.failedFix")}
        title={t("download.failed")}
        tone="danger"
      />
    )
  }

  const published = release.data
  const offers = downloadOffers(published)
  const suggested = detectOs(currentUserAgent())
  const downloadable = offers.some((offer) => offer.url !== null)

  return (
    <div className="flex flex-col gap-section">
      <div className="rounded-md border border-line bg-sunken px-3.5 py-2.5">
        <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {t("download.journey")}
        </p>
        <ol className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {JOURNEY.map((step, index) => (
            <li
              className="flex items-center gap-2 text-[13px] text-ink"
              key={step}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-raised font-data text-[11px] text-ink-2 tabular-nums">
                {index + 1}
              </span>
              {t(step)}
            </li>
          ))}
        </ol>
      </div>

      {downloadable ? null : (
        <EmptyState
          description={t("download.emptyDescription")}
          icon={PackageOpen}
          title={t("download.emptyTitle")}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("download.appTitle")}</CardTitle>
          {published ? (
            <span className="font-data text-[12px] text-ink-2 tabular-nums">
              {t("download.version", { version: published.version })}
            </span>
          ) : null}
        </CardHeader>
        <ul>
          {offers.map((offer) => (
            <DownloadOfferRow
              key={offer.os}
              offer={offer}
              suggested={offer.os === suggested}
            />
          ))}
        </ul>
      </Card>

      <LinkAppCard />

      <ReleaseNotesCard release={published} />
      <RequirementsCard />
    </div>
  )
}
