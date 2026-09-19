import type { DataColumn } from "@/components/ui/async-data-table"
import { roleKey } from "@/lib/domain/roles"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDate } from "@/lib/utils/format"

export interface AdminTeamRowMember {
  user_id: string
  email: string
  name: string
  role: string
  created_at: string
}

export function adminTeamColumns(
  t: Translate
): DataColumn<AdminTeamRowMember>[] {
  return [
    {
      key: "name",
      header: t("admin.users.name"),
      cell: (member) => (
        <>
          <span className="block truncate text-ink">{member.name}</span>
          <span className="block truncate font-data text-[12px] text-ink-3">
            {member.email}
          </span>
        </>
      ),
    },
    {
      key: "role",
      header: t("admin.users.platformRole"),
      width: "w-24",
      cell: (member) => {
        const key = roleKey(member.role)

        return key ? t(key) : member.role
      },
    },
    {
      key: "created_at",
      header: t("admin.users.createdAt"),
      width: "w-28",
      align: "end",
      hideBelow: "sm",
      cell: (member) => (
        <span className="font-data text-[12px] text-ink-3">
          {formatDate(member.created_at, t)}
        </span>
      ),
    },
  ]
}
