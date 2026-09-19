import { createFileRoute } from "@tanstack/react-router"
import {
  INBOX_THREAD_ROUTE_ID,
  InboxThread,
} from "@/components/admin/inbox/inbox-thread"
import { RouteError, RouteNotFound } from "@/components/ui/route-error"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/admin/inbox/$threadId")({
  component: AdminInboxThreadPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [
      { title: documentTitle(INBOX_THREAD_ROUTE_ID, match.context.locale) },
    ],
  }),
  notFoundComponent: RouteNotFound,
})

function AdminInboxThreadPage() {
  const { threadId } = Route.useParams()
  const search = Route.useSearch()

  return <InboxThread search={search} threadId={threadId} />
}
