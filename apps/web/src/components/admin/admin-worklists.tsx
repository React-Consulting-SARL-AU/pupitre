import {
  CreditCard,
  HardDrive,
  Hourglass,
  Inbox,
  Trash2,
  Users,
} from "lucide-react"
import { AdminWorklistCard } from "@/components/admin/admin-worklist-card"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminOverviewData } from "@/lib/api/admin-queries"
import { formatDate, formatRelative } from "@/lib/utils/format"

export interface AdminWorklistsProps {
  worklists: AdminOverviewData["worklists"]
}

export function AdminWorklists({ worklists }: AdminWorklistsProps) {
  const t = useTranslations()
  const empty = t("admin.worklists.empty")

  return (
    <div className="grid gap-gutter md:grid-cols-2 xl:grid-cols-3">
      <AdminWorklistCard
        count={worklists.unread_mail.count}
        emptyLabel={empty}
        entries={worklists.unread_mail.items.map((thread) => ({
          id: thread.id,
          to: {
            to: "/dashboard/admin/inbox/$threadId",
            params: { threadId: thread.id },
          },
          primary:
            thread.subject === "" ? t("inbox.noSubject") : thread.subject,
          secondary: `${thread.from.name ?? thread.from.email} · ${formatRelative(
            thread.last_inbound_at,
            t
          )}`,
        }))}
        icon={Inbox}
        seeAll={{ to: "/dashboard/admin/inbox", search: { unread: true } }}
        title={t("admin.worklists.unreadMail")}
      />

      <AdminWorklistCard
        count={worklists.past_due.count}
        emptyLabel={empty}
        entries={worklists.past_due.items.map((subscription) => ({
          id: subscription.id,
          to: {
            to: "/dashboard/admin/subscriptions/$id",
            params: { id: subscription.id },
          },
          primary: subscription.organization.name,
          secondary: subscription.current_period_end
            ? formatDate(subscription.current_period_end, t)
            : t("admin.subscriptions.noEnd"),
        }))}
        icon={CreditCard}
        seeAll={{
          to: "/dashboard/admin/subscriptions",
          search: { status: "past_due" },
        }}
        title={t("admin.worklists.pastDue")}
      />

      <AdminWorklistCard
        count={worklists.trials_ending.count}
        emptyLabel={empty}
        entries={worklists.trials_ending.items.map((subscription) => ({
          id: subscription.id,
          to: {
            to: "/dashboard/admin/subscriptions/$id",
            params: { id: subscription.id },
          },
          primary: subscription.organization.name,
          secondary: subscription.current_period_end
            ? formatDate(subscription.current_period_end, t)
            : t("admin.subscriptions.noEnd"),
        }))}
        icon={Hourglass}
        seeAll={{
          to: "/dashboard/admin/subscriptions",
          search: { status: "trialing" },
        }}
        title={t("admin.worklists.trialsEnding")}
      />

      <AdminWorklistCard
        count={worklists.servers_unreachable.count}
        emptyLabel={empty}
        entries={worklists.servers_unreachable.items.map((server) => ({
          id: server.id,
          to: {
            to: "/dashboard/admin/servers/$id",
            params: { id: server.id },
          },
          primary: server.name,
          secondary: `${server.organization.name} · ${formatRelative(
            server.last_heartbeat_at,
            t
          )}`,
        }))}
        icon={HardDrive}
        seeAll={{ to: "/dashboard/admin/servers", search: { stale: true } }}
        title={t("admin.worklists.serversUnreachable")}
      />

      <AdminWorklistCard
        count={worklists.seats_drifted.count}
        emptyLabel={empty}
        entries={worklists.seats_drifted.items.map((drift) => ({
          id: drift.organization.id,
          to: {
            to: "/dashboard/admin/organizations/$id",
            params: { id: drift.organization.id },
          },
          primary: drift.organization.name,
          secondary: t("admin.worklists.seatsDrift", {
            used: drift.used,
            paid: drift.paid,
          }),
        }))}
        icon={Users}
        seeAll={{
          to: "/dashboard/admin/subscriptions",
          search: { drifted: true },
        }}
        title={t("admin.worklists.seatsDrifted")}
      />

      <AdminWorklistCard
        count={worklists.deletions_scheduled.count}
        emptyLabel={empty}
        entries={worklists.deletions_scheduled.items.map((scheduled) => ({
          id: `${scheduled.kind}-${scheduled.id}`,
          to:
            scheduled.kind === "user"
              ? {
                  to: "/dashboard/admin/users/$id",
                  params: { id: scheduled.id },
                }
              : {
                  to: "/dashboard/admin/organizations/$id",
                  params: { id: scheduled.id },
                },
          primary: scheduled.label,
          secondary: `${t(
            scheduled.kind === "user"
              ? "admin.worklists.deletionKind.user"
              : "admin.worklists.deletionKind.organization"
          )} · ${formatDate(scheduled.deletion_at, t)}`,
        }))}
        icon={Trash2}
        seeAll={{
          to: "/dashboard/admin/users",
          search: { state: "deleting" },
        }}
        title={t("admin.worklists.deletionsScheduled")}
      />
    </div>
  )
}
