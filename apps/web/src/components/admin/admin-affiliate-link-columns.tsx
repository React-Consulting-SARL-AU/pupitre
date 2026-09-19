import type { DataColumn } from "@/components/ui/async-data-table"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { StatusDot } from "@/components/ui/status-dot"
import type { Translate } from "@/lib/i18n/i18n"

export interface AdminAffiliateLinkRowLink {
  id: string
  code: string
  name: string
  free_months: number
  seats: number
  disabled: boolean
  referrals: number
  url: string
}

export interface AdminAffiliateLinkColumnsHandlers {
  canAct: boolean
  /** The identifier of the link the platform is switching right now, if any. */
  toggling: string | undefined
  onToggle: (link: AdminAffiliateLinkRowLink, disabled: boolean) => void
}

export function adminAffiliateLinkColumns(
  t: Translate,
  { canAct, toggling, onToggle }: AdminAffiliateLinkColumnsHandlers
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
      width: "w-[280px]",
      hideBelow: "md",
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
      key: "terms",
      header: t("admin.links.freeMonthsField"),
      width: "w-40",
      hideBelow: "lg",
      cell: (link) => (
        <>
          <p>{t.plural("admin.links.freeMonths", link.free_months)}</p>
          <p>{t.plural("admin.links.seats", link.seats)}</p>
        </>
      ),
    },
    {
      key: "referrals",
      header: t("admin.links.referredOrganizations"),
      width: "w-28",
      align: "end",
      cell: (link) => t.plural("admin.links.referrals", link.referrals),
    },
    {
      key: "state",
      header: t("table.actions"),
      width: "w-52",
      align: "end",
      cell: (link) => {
        const state = link.disabled
          ? t("admin.links.disabled")
          : t("admin.links.enabled")

        return (
          <span className="inline-flex items-center justify-end gap-3">
            <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
              <StatusDot
                label={state}
                shape={link.disabled ? "hollow" : "filled"}
                tone={link.disabled ? "muted" : "ok"}
              />
              {state}
            </span>
            {canAct ? (
              <Button
                loading={toggling === link.id}
                onClick={() => {
                  onToggle(link, !link.disabled)
                }}
                size="sm"
              >
                {link.disabled
                  ? t("admin.links.enable")
                  : t("admin.links.disable")}
              </Button>
            ) : null}
          </span>
        )
      },
    },
  ]
}
