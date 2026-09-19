import { createFileRoute } from "@tanstack/react-router"
import {
  INBOX_LAYOUT_ROUTE_ID,
  InboxWorkspace,
} from "@/components/admin/inbox/inbox-workspace"
import { parseInboxSearch } from "@/lib/domain/inbox-search"
import { useListSearch } from "@/lib/domain/list-search"
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
  const list = useListSearch(Route)

  return <InboxWorkspace {...list} />
}
