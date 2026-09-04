import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatusDot } from "@/components/ui/status-dot"
import { roleLabel } from "@/lib/domain/roles"
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
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot label="En attente" shape="breathing" tone="muted" />
        <div className="min-w-0">
          <p className="truncate font-data text-[12px] text-ink">
            {invitation.email}
          </p>
          <p className="text-[12px] text-ink-3">
            Expire le {formatDateTime(invitation.expires_at)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {invitation.role ? roleLabel(invitation.role) : "Membre"}
        </span>
        {cancellable ? (
          <ConfirmDialog
            confirmLabel="Annuler"
            description={`L'invitation de ${invitation.email} est annulée. Le lien déjà envoyé cesse de fonctionner, et un serveur qui l'attendait reste sans attribution.`}
            onConfirm={() => {
              onCancel(invitation.id)
            }}
            pending={pending}
            title="Annuler cette invitation ?"
            triggerLabel="Annuler"
          />
        ) : null}
      </div>
    </li>
  )
}
