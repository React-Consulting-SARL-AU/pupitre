import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"

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

export interface AdminAffiliateLinkRowProps {
  link: AdminAffiliateLinkRowLink
  toggling: boolean
  canAct: boolean
  onToggle: (disabled: boolean) => void
}

export function AdminAffiliateLinkRow({
  link,
  toggling,
  canAct,
  onToggle,
}: AdminAffiliateLinkRowProps) {
  const t = useTranslations()
  const state = link.disabled
    ? t("admin.links.disabled")
    : t("admin.links.enabled")

  return (
    <li
      aria-busy={toggling || undefined}
      className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0 sm:gap-6"
    >
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate font-medium text-[13px] text-ink underline-offset-2 hover:underline"
          params={{ id: link.id }}
          to="/dashboard/admin/affiliate-links/$id"
        >
          {link.name}
        </Link>
        <p className="flex items-center gap-1 truncate font-data text-[12px] text-ink-3">
          <span className="truncate">{link.url}</span>
          <CopyButton
            copiedLabel={t("admin.links.copied")}
            failedLabel={t("admin.links.copyFailed")}
            label={t("admin.links.copy")}
            value={link.url}
          />
        </p>
      </div>

      <p className="font-data text-[12px] text-ink-2 tabular-nums sm:w-28">
        {link.code}
      </p>

      <div className="text-[12px] text-ink-2 tabular-nums sm:w-40">
        <p>{t.plural("admin.links.freeMonths", link.free_months)}</p>
        <p>{t.plural("admin.links.seats", link.seats)}</p>
      </div>

      <p className="font-data text-[12px] text-ink-2 tabular-nums sm:w-28">
        {t.plural("admin.links.referrals", link.referrals)}
      </p>

      <div className="flex items-center gap-3">
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
            loading={toggling}
            onClick={() => {
              onToggle(!link.disabled)
            }}
            size="sm"
          >
            {link.disabled ? t("admin.links.enable") : t("admin.links.disable")}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
