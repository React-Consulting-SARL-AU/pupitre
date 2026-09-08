import { QueryClientProvider } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import { createQueryClient } from "@/lib/query/client"
import { routeTree } from "./routeTree.gen"

/** Long enough that a cached page never blinks, short enough to answer a real wait. */
const PENDING_MS = 150

const PENDING_MIN_MS = 300

export function getRouter() {
  const queryClient = createQueryClient()

  return createRouter({
    context: { queryClient },
    defaultPendingMinMs: PENDING_MIN_MS,
    defaultPendingMs: PENDING_MS,
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
