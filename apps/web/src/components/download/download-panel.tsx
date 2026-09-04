import { useQuery } from "@tanstack/react-query"
import { PackageOpen } from "lucide-react"
import { DownloadOfferRow } from "@/components/download/download-offer-row"
import { ReleaseNotesCard } from "@/components/download/release-notes-card"
import { RequirementsCard } from "@/components/download/requirements-card"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { latestAppReleaseQueryOptions } from "@/lib/api/queries"
import { detectOs, downloadOffers } from "@/lib/domain/downloads"

function currentUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

export function DownloadPanel() {
  const release = useQuery(latestAppReleaseQueryOptions())

  if (release.isPending) {
    return <LoadingState label="Lecture des versions publiées…" />
  }

  if (release.isError) {
    return (
      <Callout
        fix="Rechargez la page ; si cela persiste, reconnectez-vous."
        title="Les versions publiées n'ont pas pu être lues."
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
      {downloadable ? null : (
        <EmptyState
          description="Aucune version de l'app n'a encore été publiée. Cette page affichera les installateurs des trois systèmes, et leurs notes, dès la première release signée."
          icon={PackageOpen}
          title="Rien à télécharger pour l'instant"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>L'app Pupitre</CardTitle>
          {published ? (
            <span className="font-data text-[12px] text-ink-2 tabular-nums">
              Version {published.version}
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

      <ReleaseNotesCard release={published} />
      <RequirementsCard />
    </div>
  )
}
