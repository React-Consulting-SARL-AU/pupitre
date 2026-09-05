import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { roleKey } from "@/lib/domain/roles"
import { formatDateTime } from "@/lib/utils/format"

export interface InvitationRowInvitation {
  id: string
  email: string
  role: string | null
  expires_at: string
}

export interface InvitationRowProps {
  invitation: InvitationRowInvitation
  cancellable: boolean
  onCancel: (invitationId: string) => void
  pending: boolean
}

export function InvitationRow({
  invitation,
  cancellable,
  onCancel,
  pending,
}: InvitationRowProps) {
  const t = useTranslations()
  const role = invitation.role ? roleKey(invitation.role) : "role.member"

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot
          label={t("members.invitation.pending")}
          shape="breathing"
          tone="muted"
        />
        <div className="min-w-0">
          <p className="truncate font-data text-[12px] text-ink">
            {invitation.email}
          </p>
          <p className="text-[12px] text-ink-3">
            {t("members.invitation.expires", {
              date: formatDateTime(invitation.expires_at, t),
            })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {role ? t(role) : invitation.role}
        </span>
        {cancellable ? (
          <ConfirmDialog
            confirmLabel={t("members.invitation.cancel")}
            description={t("members.invitation.cancelDescription", {
              email: invitation.email,
            })}
            onConfirm={() => {
              onCancel(invitation.id)
            }}
            pending={pending}
            title={t("members.invitation.cancelTitle")}
            triggerLabel={t("members.invitation.cancel")}
          />
        ) : null}
      </div>
    </li>
  )
}
