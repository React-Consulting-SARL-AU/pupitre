import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { type Me, queryKeys } from "@/lib/api/queries"

export const Route = createFileRoute("/dashboard/admin")({
  /** The dashboard already read the session; a platform role opens these pages, nothing else does. */
  beforeLoad: ({ context }) => {
    const me = context.queryClient.getQueryData<Me>(queryKeys.me)

    if (!me?.platform_role) {
      throw redirect({ to: "/dashboard" })
    }
  },
  component: Outlet,
})
