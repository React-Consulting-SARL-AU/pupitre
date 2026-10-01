import { createFileRoute, redirect } from "@tanstack/react-router"
import { StartPanel } from "@/components/dashboard/start-panel"
import { type Me, queryKeys, serversQueryOptions } from "@/lib/api/queries"
import { isPlatformOrganization } from "@/lib/domain/admin"
import { onboardingComplete } from "@/lib/domain/onboarding"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/start")({
  // Once a server has been online, onboarding is over for good.
  beforeLoad: async ({ context }) => {
    const me = context.queryClient.getQueryData<Me>(queryKeys.me)

    if (isPlatformOrganization(me?.active_organization?.id)) {
      throw redirect({ to: "/dashboard/admin" })
    }

    if (!me) {
      return
    }

    const servers = await context.queryClient.ensureQueryData(
      serversQueryOptions()
    )

    if (onboardingComplete(servers)) {
      throw redirect({ to: "/dashboard/servers" })
    }
  },
  component: StartPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/dashboard/start", match.context.locale) }],
  }),
})

function StartPage() {
  return (
    <div className="mx-auto w-full max-w-[560px] py-6">
      <StartPanel />
    </div>
  )
}
