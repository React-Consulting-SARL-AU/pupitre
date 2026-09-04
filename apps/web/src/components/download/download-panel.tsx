import { useQuery } from "@tanstack/react-query"
import { PackageOpen } from "lucide-react"
import { DownloadOfferRow } from "@/components/download/download-offer-row"
import { ReleaseNotesCard } from "@/components/download/release-notes-card"
import { RequirementsCard } from "@/components/download/requirements-card"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { latestReleaseQueryOptions } from "@/lib/api/queries"
import { appDownloadBaseUrl } from "@/lib/config/urls"
import { detectOs, downloadOffers } from "@/lib/domain/downloads"

function currentUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

export function DownloadPanel() {
  const release = useQuery(latestReleaseQueryOptions())

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

  const version = release.data?.version ?? null
  const offers = downloadOffers(version, appDownloadBaseUrl())
  const suggested = detectOs(currentUserAgent())
  const downloadable = offers.some((offer) => offer.url !== null)

  return (
    <div className="flex flex-col gap-section">
      {downloadable ? null : (
        <EmptyState
          description={
            version
              ? `La version ${version} est publiée pour l'agent, mais les installateurs de l'app ne le sont pas encore. Ils arriveront ici dès la première release signée.`
              : "Aucune version de Pupitre n'a encore été publiée. Cette page affichera les installateurs des trois systèmes dès la première release."
          }
          icon={PackageOpen}
          title="Rien à télécharger pour l'instant"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>L'app Pupitre</CardTitle>
          {version ? (
            <span className="font-data text-[12px] text-ink-2 tabular-nums">
              Version {version}
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

      <ReleaseNotesCard version={version} />
      <RequirementsCard />
    </div>
  )
}
