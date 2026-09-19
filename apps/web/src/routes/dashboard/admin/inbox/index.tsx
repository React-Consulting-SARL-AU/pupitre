import { createFileRoute } from "@tanstack/react-router"
import { EmptyState } from "@/components/ui/empty-state"
import { useTranslations } from "@/hooks/use-locale"

export const Route = createFileRoute("/dashboard/admin/inbox/")({
  component: AdminInboxIndexPage,
})

/** On a wide screen the right pane stays, empty; below `lg` only the list shows. */
function AdminInboxIndexPage() {
  const t = useTranslations()

  return (
    <div className="hidden lg:block">
      <EmptyState title={t("inbox.threadNone")} />
    </div>
  )
}
