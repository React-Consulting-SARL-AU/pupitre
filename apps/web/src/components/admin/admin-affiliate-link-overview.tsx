import { AdminFigure } from "@/components/admin/admin-figure"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyButton } from "@/components/ui/copy-button"
import { Facts } from "@/components/ui/facts"
import { useTranslations } from "@/hooks/use-locale"
import type { AffiliateLinkDetail } from "@/lib/api/admin-queries"
import { affiliateConversionFigures } from "@/lib/domain/affiliate"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminAffiliateLinkOverviewProps {
  link: AffiliateLinkDetail
}

export function AdminAffiliateLinkOverview({
  link,
}: AdminAffiliateLinkOverviewProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.links.address")}</CardTitle>
        </CardHeader>
        <CardBody className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-data text-[12px] text-ink-2">
            {link.url}
          </span>
          <CopyButton
            copiedLabel={t("admin.links.copied")}
            failedLabel={t("admin.links.copyFailed")}
            label={t("admin.links.copy")}
            value={link.url}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.links.terms")}</CardTitle>
        </CardHeader>

        <Facts
          facts={[
            { label: t("admin.links.code"), value: link.code },
            {
              label: t("admin.links.freeMonthsField"),
              value: link.free_months,
            },
            { label: t("admin.links.seatsField"), value: link.seats },
            {
              label: t("admin.links.partnerNameField"),
              value: link.partner?.name ?? t("format.none"),
            },
            {
              label: t("admin.links.partnerEmailField"),
              value: link.partner?.email ?? t("format.none"),
            },
            {
              label: t("admin.users.createdAt"),
              value: formatDateTime(link.created_at, t),
            },
            { label: t("admin.links.clicksTotal"), value: link.clicks.total },
            {
              label: t("admin.links.clicks30Days"),
              value: link.clicks.last_30_days,
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.links.conversion")}</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <div className="flex min-w-max">
            {affiliateConversionFigures(link.conversion).map((figure) => (
              <AdminFigure figure={figure} key={figure.id} />
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.links.notesField")}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="whitespace-pre-wrap text-[13px] text-ink-2">
            {link.notes ?? t("admin.links.noNotes")}
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
