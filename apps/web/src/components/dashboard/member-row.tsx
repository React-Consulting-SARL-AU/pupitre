import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { roleLabel } from "@/lib/domain/roles"

export interface MemberRowMember {
  id: string
  user_id: string
  email: string
  name: string
  role: string
}

export interface MemberRowProps {
  member: MemberRowMember
  removable: boolean
  isSelf: boolean
  onRemove: (memberId: string) => void
  pending: boolean
}

export function MemberRow({
  member,
  removable,
  isSelf,
  onRemove,
  pending,
}: MemberRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate font-medium text-[13px] text-ink">
          {member.name}
          {isSelf ? <span className="text-ink-3"> · vous</span> : null}
        </p>
        <p className="truncate font-data text-[12px] text-ink-3">
          {member.email}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {roleLabel(member.role)}
        </span>
        {removable ? (
          <ConfirmDialog
            confirmLabel="Retirer"
            description={`${member.email} perd l'accès à l'organisation. Ses clés tombent des serveurs qui lui sont attribués, et l'attribution reste à reprendre depuis chaque fiche serveur.`}
            onConfirm={() => {
              onRemove(member.id)
            }}
            pending={pending}
            title="Retirer ce membre ?"
            triggerLabel="Retirer"
          />
        ) : null}
      </div>
    </li>
  )
}
