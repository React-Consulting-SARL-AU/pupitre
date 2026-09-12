import { useQuery } from "@tanstack/react-query"
import { useMachine } from "@/hooks/use-machine"
import { latestAppReleaseQueryOptions } from "@/lib/api/queries"
import {
  type DownloadOffer,
  downloadOffers,
  isSuggested,
  type PublishedAppRelease,
} from "@/lib/domain/downloads"

export interface SuggestedOffer {
  published: PublishedAppRelease | null
  offer: DownloadOffer | null
}

export function useSuggestedOffer(): SuggestedOffer {
  const release = useQuery(latestAppReleaseQueryOptions())
  const published = release.data ?? null
  const machine = useMachine()

  return {
    published,
    offer:
      downloadOffers(published).find((candidate) =>
        isSuggested(candidate, machine)
      ) ?? null,
  }
}
