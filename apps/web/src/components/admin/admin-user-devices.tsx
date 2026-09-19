import { ShieldOff } from "lucide-react"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { type AdminUserDetail, revokeDevice } from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { formatRelative } from "@/lib/utils/format"

export interface AdminUserDevicesProps {
  detail: AdminUserDetail
  acts: boolean
  /** Why the revocation is dead for this reader, on the control itself. */
  refusedTitle: string | undefined
}

interface Revocation {
  deviceId: string
  name: string
  reason: string
}

export function AdminUserDevices({
  detail,
  acts,
  refusedTitle,
}: AdminUserDevicesProps) {
  const t = useTranslations()
  const revoke = useOptimisticMutation<Revocation>({
    mutationFn: ({ deviceId, reason }) =>
      revokeDevice(detail.id, deviceId, reason),
    invalidate: [queryKeys.admin.user(detail.id), queryKeys.admin.allServers],
    toast: {
      done: (_data, { name }) => t("admin.users.revoked", { name }),
      failed: () => ({
        title: t("admin.users.revokeFailed"),
        fix: t("admin.users.revokeFailedFix"),
      }),
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.users.devices")}</CardTitle>
      </CardHeader>

      {detail.devices.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">{t("admin.users.noDevice")}</p>
        </CardBody>
      ) : (
        <ul>
          {detail.devices.map((device) => (
            <li
              className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
              key={device.id}
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {device.name}
              </span>
              <span className="font-data text-[12px] text-ink-3 tabular-nums">
                {formatRelative(device.last_used_at ?? null, t)}
              </span>
              <ConfirmFormDialog
                busy={
                  revoke.isPending && revoke.variables?.deviceId === device.id
                }
                busyLabel={t("admin.users.revoking")}
                confirmLabel={t("admin.users.revokeDevice")}
                description={t("admin.users.revokeDescription", {
                  name: device.name,
                })}
                id={`revoke-${device.id}`}
                onConfirm={(values) => {
                  revoke.mutate({
                    deviceId: device.id,
                    name: device.name,
                    reason: values.reason,
                  })
                }}
                reason="required"
                reasonLabel={t("admin.users.reason")}
                reasonRequiredMessage={t("admin.users.revokeReasonRequired")}
                title={t("admin.users.revokeTitle")}
                triggerDisabled={!acts}
                triggerIcon={ShieldOff}
                triggerLabel={t("admin.users.revokeDevice")}
                triggerTitle={refusedTitle}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
