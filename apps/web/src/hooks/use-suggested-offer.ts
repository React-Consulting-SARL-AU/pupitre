import { useQuery } from "@tanstack/react-query"
import { latestAppReleaseQueryOptions } from "@/lib/api/queries"
import {
  type DownloadOffer,
  detectOs,
  downloadOffers,
  type PublishedAppRelease,
} from "@/lib/domain/downloads"

export interface SuggestedOffer {
  published: PublishedAppRelease | null
  offer: DownloadOffer | null
}

function currentUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

export function useSuggestedOffer(): SuggestedOffer {
  const release = useQuery(latestAppReleaseQueryOptions())
  const published = release.data ?? null
  const suggested = detectOs(currentUserAgent())

  return {
    published,
    offer:
      downloadOffers(published).find(
        (candidate) => candidate.os === suggested
      ) ?? null,
  }
}
