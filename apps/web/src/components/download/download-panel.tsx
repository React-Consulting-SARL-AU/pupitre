import { useQuery } from "@tanstack/react-query"
import { PackageOpen, RotateCw } from "lucide-react"
import { StartChecklist } from "@/components/dashboard/start-checklist"
import { DownloadOfferRow } from "@/components/download/download-offer-row"
import { ReleaseNotesCard } from "@/components/download/release-notes-card"
import { RequirementsCard } from "@/components/download/requirements-card"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { useMachine } from "@/hooks/use-machine"
import { latestAppReleaseQueryOptions } from "@/lib/api/queries"
import { downloadOffers, isSuggested } from "@/lib/domain/downloads"

export function DownloadPanel() {
  const t = useTranslations()
  const release = useQuery(latestAppReleaseQueryOptions())
  const machine = useMachine()

  if (release.isPending) {
    return <SkeletonCards />
  }

  if (release.isError) {
    return (
      <Callout
        action={
          <Button
            icon={RotateCw}
            loading={release.isFetching}
            onClick={() => {
              release.refetch()
            }}
            size="sm"
          >
            {t("common.retry")}
          </Button>
        }
        fix={t("download.failedFix")}
        title={t("download.failed")}
        tone="danger"
      />
    )
  }

  const published = release.data
  const offers = downloadOffers(published)
  const downloadable = offers.some((offer) => offer.url !== null)

  return (
    <div className="flex flex-col gap-section">
      <StartChecklist compact />

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
              key={`${offer.os}-${offer.arch ?? "none"}-${offer.format}`}
              offer={offer}
              suggested={isSuggested(offer, machine)}
            />
          ))}
        </ul>
      </Card>

      <ReleaseNotesCard release={published} />
      <RequirementsCard />
    </div>
  )
}
