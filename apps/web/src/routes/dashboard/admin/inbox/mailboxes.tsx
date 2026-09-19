import { createFileRoute } from "@tanstack/react-router"
import {
  INBOX_MAILBOXES_ROUTE_ID,
  InboxMailboxSettings,
} from "@/components/admin/inbox/inbox-mailbox-settings"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/admin/inbox/mailboxes")({
  component: AdminInboxMailboxesPage,
  head: ({ match }) => ({
    meta: [
      { title: documentTitle(INBOX_MAILBOXES_ROUTE_ID, match.context.locale) },
    ],
  }),
})

function AdminInboxMailboxesPage() {
  return <InboxMailboxSettings />
}
