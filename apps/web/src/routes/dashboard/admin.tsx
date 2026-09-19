import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { type Me, queryKeys } from "@/lib/api/queries"
import { platformOpen } from "@/lib/domain/admin"

export const Route = createFileRoute("/dashboard/admin")({
  /** The dashboard already read the session; these pages open on the platform organisation, for its members, and nowhere else. */
  beforeLoad: ({ context }) => {
    const me = context.queryClient.getQueryData<Me>(queryKeys.me)

    if (!platformOpen(me?.active_organization?.id, me?.platform_role ?? null)) {
      throw redirect({ to: "/dashboard" })
    }
  },
  component: Outlet,
})
