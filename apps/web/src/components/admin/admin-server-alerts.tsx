import { BellOff } from "lucide-react"
import { ServerAlerts } from "@/components/dashboard/server-alerts"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AdminServerDetail,
  clearServerAlerts,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"

export interface AdminServerAlertsProps {
  server: AdminServerDetail
  canAct: boolean
}

export function AdminServerAlerts({ server, canAct }: AdminServerAlertsProps) {
  const t = useTranslations()
  const clear = useOptimisticMutation({
    mutationFn: () => clearServerAlerts(server.id),
    invalidate: [queryKeys.admin.server(server.id), queryKeys.admin.overview],
    toast: {
      done: () => t("admin.servers.alertsCleared", { name: server.name }),
      failed: () => ({
        title: t("admin.servers.clearAlertsFailed"),
        fix: t("admin.servers.clearAlertsFailedFix"),
      }),
    },
  })

  return (
    <div className="flex flex-col gap-gutter">
      <ServerAlerts alerts={server.alerts} />

      {canAct && server.alerts.length > 0 ? (
        <div className="flex justify-end">
          <ConfirmDialog
            busy={clear.isPending}
            busyLabel={t("admin.servers.clearingAlerts")}
            confirmLabel={t("admin.servers.clearAlerts")}
            description={t("admin.servers.clearAlertsDescription", {
              name: server.name,
            })}
            onConfirm={() => {
              clear.mutate(undefined)
            }}
            title={t("admin.servers.clearAlertsTitle")}
            triggerIcon={BellOff}
            triggerLabel={t("admin.servers.clearAlerts")}
            triggerVariant="secondary"
          />
        </div>
      ) : null}
    </div>
  )
}
