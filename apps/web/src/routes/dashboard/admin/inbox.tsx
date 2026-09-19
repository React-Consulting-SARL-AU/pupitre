import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  INBOX_LAYOUT_ROUTE_ID,
  InboxWorkspace,
} from "@/components/admin/inbox/inbox-workspace"
import { type InboxSearch, parseInboxSearch } from "@/lib/domain/inbox-search"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/admin/inbox")({
  component: AdminInboxLayout,
  head: ({ match }) => ({
    meta: [
      { title: documentTitle(INBOX_LAYOUT_ROUTE_ID, match.context.locale) },
    ],
  }),
  validateSearch: parseInboxSearch,
})

function AdminInboxLayout() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  return (
    <InboxWorkspace
      onSearchChange={(patch: Partial<InboxSearch>) => {
        navigate({ to: ".", search: { ...search, ...patch } })
      }}
      search={search}
    />
  )
}
