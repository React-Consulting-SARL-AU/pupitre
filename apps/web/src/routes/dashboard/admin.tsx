import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { AdminSearchDialog } from "@/components/admin/admin-search-dialog"
import { type Me, queryKeys } from "@/lib/api/queries"
import { platformOpen } from "@/lib/domain/admin"
import { PLATFORM_SEARCH_EVENT } from "@/lib/domain/admin-search"

export const Route = createFileRoute("/dashboard/admin")({
  /** The dashboard already read the session; these pages open on the platform organisation, for its members, and nowhere else. */
  beforeLoad: ({ context }) => {
    const me = context.queryClient.getQueryData<Me>(queryKeys.me)

    if (!platformOpen(me?.active_organization?.id, me?.platform_role ?? null)) {
      throw redirect({ to: "/dashboard" })
    }
  },
  component: AdminLayout,
})

/** The shortcut is registered once, here, and serves every page under the platform. */
function AdminLayout() {
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearching(true)
      }
    }

    function onAsked() {
      setSearching(true)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(PLATFORM_SEARCH_EVENT, onAsked)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener(PLATFORM_SEARCH_EVENT, onAsked)
    }
  }, [])

  return (
    <>
      <AdminSearchDialog onOpenChange={setSearching} open={searching} />
      <Outlet />
    </>
  )
}
