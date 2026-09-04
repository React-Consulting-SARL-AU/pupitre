import { QueryClient } from "@tanstack/react-query"

const STALE_TIME_MS = 10_000

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: true,
        staleTime: STALE_TIME_MS,
      },
    },
  })
}
