import type { DataColumn } from "@/components/ui/async-data-table"
import { CopyButton } from "@/components/ui/copy-button"
import { StatusDot } from "@/components/ui/status-dot"
import type { Translate } from "@/lib/i18n/i18n"

export interface AdminAffiliateLinkRowLink {
  id: string
  code: string
  name: string
  disabled: boolean
  referrals: number
  servers: number
  partner_name: string | null
  clicks_30_days: number
  url: string
}

export function adminAffiliateLinkColumns(
  t: Translate
): DataColumn<AdminAffiliateLinkRowLink>[] {
  return [
    {
      key: "name",
      header: t("admin.links.name"),
      cell: (link) => link.name,
    },
    {
      key: "url",
      header: t("admin.links.code"),
      width: "w-[260px]",
      hideBelow: "md",
      interactive: true,
      cell: (link) => (
        <span className="flex items-center gap-1 truncate font-data text-[12px] text-ink-3">
          <span className="truncate">{link.url}</span>
          <CopyButton
            copiedLabel={t("admin.links.copied")}
            failedLabel={t("admin.links.copyFailed")}
            label={t("admin.links.copy")}
            value={link.url}
          />
        </span>
      ),
    },
    {
      key: "partner",
      header: t("admin.links.partner"),
      width: "w-40",
      hideBelow: "lg",
      cell: (link) => link.partner_name ?? t("format.none"),
    },
    {
      key: "clicks",
      header: t("admin.links.clicksHeader"),
      width: "w-28",
      align: "end",
      hideBelow: "sm",
      cell: (link) => link.clicks_30_days,
    },
    {
      key: "referrals",
      header: t("admin.links.referralsHeader"),
      width: "w-28",
      align: "end",
      cell: (link) => link.referrals,
    },
    {
      key: "servers",
      header: t("admin.links.serversHeader"),
      width: "w-24",
      align: "end",
      hideBelow: "sm",
      cell: (link) => link.servers,
    },
    {
      key: "state",
      header: t("admin.links.state"),
      width: "w-32",
      align: "end",
      cell: (link) => {
        const state = link.disabled
          ? t("admin.links.disabled")
          : t("admin.links.enabled")

        return (
          <span className="inline-flex items-center justify-end gap-2 text-[13px] text-ink-2">
            <StatusDot
              label={state}
              shape={link.disabled ? "hollow" : "filled"}
              tone={link.disabled ? "muted" : "ok"}
            />
            {state}
          </span>
        )
      },
    },
  ]
}
