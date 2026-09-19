import { Link } from "@tanstack/react-router"
import { Crown, UserMinus } from "lucide-react"
import { useState } from "react"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { RowActionsMenu } from "@/components/ui/row-actions-menu"
import { useConfirmMutation } from "@/hooks/use-confirm-mutation"
import { useTranslations } from "@/hooks/use-locale"
import {
  type AdminOrganizationDetail,
  removeOrganizationMember,
  transferOrganization,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { isPlatformOrganization } from "@/lib/domain/admin"
import { roleKey } from "@/lib/domain/roles"
import type { ConfirmFormValues } from "@/lib/schemas/confirm-form"
import { formatDate } from "@/lib/utils/format"

export interface AdminOrganizationMembersProps {
  detail: AdminOrganizationDetail
  acts: boolean
}

type MemberAct = "transfer" | "remove"

interface Aimed {
  act: MemberAct
  userId: string
  email: string
}

export function AdminOrganizationMembers({
  detail,
  acts,
}: AdminOrganizationMembersProps) {
  const t = useTranslations()
  const [aimed, setAimed] = useState<Aimed | null>(null)
  const platform = isPlatformOrganization(detail.id)
  const touched = [
    queryKeys.admin.organization(detail.id),
    queryKeys.admin.allOrganizations,
    queryKeys.admin.allUsers,
  ]
  const transfer = useConfirmMutation<ConfirmFormValues>({
    mutationFn: () => transferOrganization(detail.id, aimed?.userId ?? ""),
    invalidate: touched,
    done: () =>
      t("admin.organizations.transferDone", {
        email: aimed?.email ?? "",
        name: detail.name,
      }),
    failed: { title: t("admin.organizations.transferFailed") },
    onDone: () => {
      setAimed(null)
    },
  })
  const remove = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) =>
      removeOrganizationMember(detail.id, aimed?.userId ?? "", values.reason),
    invalidate: touched,
    done: () =>
      t("admin.organizations.removeMemberDone", {
        email: aimed?.email ?? "",
        name: detail.name,
      }),
    failed: {
      title: t("admin.organizations.removeMemberFailed"),
      fix: t("admin.organizations.removeMemberFailedFix"),
    },
    onDone: () => {
      setAimed(null)
    },
  })

  function roleName(role: string): string {
    const key = roleKey(role)

    return key ? t(key) : role
  }

  function close() {
    setAimed(null)
    transfer.reset()
    remove.reset()
  }

  const email = aimed?.email ?? ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.organizations.members")}</CardTitle>
      </CardHeader>

      {platform ? (
        <CardBody>
          <Callout
            title={t("admin.organizations.platformOrganization")}
            tone="warn"
          />
        </CardBody>
      ) : null}

      {detail.members.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {t("admin.organizations.noMember")}
          </p>
        </CardBody>
      ) : (
        <ul>
          {detail.members.map((member) => (
            <li
              className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
              key={member.user_id}
            >
              <Link
                className="min-w-0 flex-1 truncate font-data text-[13px] text-ink underline-offset-2 hover:underline"
                params={{ id: member.user_id }}
                to="/dashboard/admin/users/$id"
              >
                {member.email}
              </Link>
              <span className="min-w-0 truncate text-[12px] text-ink-2 sm:w-40">
                {member.name || t("format.none")}
              </span>
              <span className="text-[12px] text-ink-2 sm:w-24">
                {roleName(member.role)}
              </span>
              <span className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28 sm:text-right">
                {formatDate(member.created_at, t)}
              </span>
              {platform ? null : (
                <RowActionsMenu
                  actions={[
                    {
                      label: t("admin.organizations.transfer"),
                      icon: Crown,
                      disabled: !acts,
                      onSelect: () => {
                        setAimed({
                          act: "transfer",
                          userId: member.user_id,
                          email: member.email,
                        })
                      },
                    },
                    {
                      label: t("admin.organizations.removeMember"),
                      icon: UserMinus,
                      tone: "danger",
                      disabled: !acts,
                      onSelect: () => {
                        setAimed({
                          act: "remove",
                          userId: member.user_id,
                          email: member.email,
                        })
                      },
                    },
                  ]}
                  label={t("admin.organizations.memberActions", {
                    email: member.email,
                  })}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmFormDialog
        busy={transfer.busy}
        busyLabel={t("admin.organizations.transferring")}
        confirmLabel={t("admin.organizations.transfer")}
        description={t("admin.organizations.transferDescription", {
          email,
          name: detail.name,
        })}
        id={`transfer-${detail.id}`}
        onConfirm={transfer.run}
        onOpenChange={(open) => {
          if (!open) {
            close()
          }
        }}
        open={aimed?.act === "transfer"}
        refusal={transfer.refusal}
        title={t("admin.organizations.transferTitle")}
        tone="warning"
        triggerLabel={t("admin.organizations.transfer")}
      />

      <ConfirmFormDialog
        busy={remove.busy}
        busyLabel={t("admin.organizations.removingMember")}
        confirmLabel={t("admin.organizations.removeMember")}
        description={t("admin.organizations.removeMemberDescription", {
          email,
          name: detail.name,
        })}
        id={`remove-member-${detail.id}`}
        onConfirm={remove.run}
        onOpenChange={(open) => {
          if (!open) {
            close()
          }
        }}
        open={aimed?.act === "remove"}
        reason="required"
        reasonLabel={t("admin.organizations.reason")}
        reasonRequiredMessage={t("admin.organizations.reasonRequired")}
        refusal={remove.refusal}
        title={t("admin.organizations.removeMemberTitle")}
        triggerLabel={t("admin.organizations.removeMember")}
      />
    </Card>
  )
}
