import { createFileRoute } from "@tanstack/react-router"
import { INBOX_ROUTE_ID, InboxList } from "@/components/admin/inbox/inbox-list"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/admin/inbox/")({
  component: AdminInboxPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(INBOX_ROUTE_ID, match.context.locale) }],
  }),
})

function AdminInboxPage() {
  return <InboxList />
}
