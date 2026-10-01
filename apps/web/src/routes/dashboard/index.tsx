import { createFileRoute, redirect } from "@tanstack/react-router"
import { meQueryOptions } from "@/lib/api/queries"
import { landingRoute } from "@/lib/domain/onboarding"

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions())

    throw redirect({ to: landingRoute(me.servers) })
  },
})
