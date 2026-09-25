import { useNavigate } from "@tanstack/react-router"
import { Ban, RotateCcw } from "lucide-react"
import { AdminAffiliateLinkDeleteDialog } from "@/components/admin/admin-affiliate-link-delete-dialog"
import { Button } from "@/components/ui/button"
import { DangerZone } from "@/components/ui/danger-zone"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AffiliateLink,
  type AffiliateLinkDetail,
  setAffiliateLinkDisabled,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"

export interface AdminAffiliateLinkDangerProps {
  link: AffiliateLinkDetail
}

export function AdminAffiliateLinkDanger({
  link,
}: AdminAffiliateLinkDangerProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const toggle = useOptimisticMutation<boolean, AffiliateLink>({
    mutationFn: (disabled) => setAffiliateLinkDisabled(link.id, disabled),
    invalidate: [
      queryKeys.admin.affiliateLink(link.id),
      queryKeys.admin.affiliateLinks,
    ],
    toast: {
      done: (_data, disabled) =>
        t(disabled ? "admin.links.disabledDone" : "admin.links.enabledDone", {
          name: link.name,
        }),
      failed: () => ({
        title: t("admin.links.toggleFailed"),
        fix: t("common.retryLater"),
      }),
    },
  })

  return (
    <div className="flex flex-col gap-gutter">
      <DangerZone
        action={
          <Button
            icon={link.disabled ? RotateCcw : Ban}
            loading={toggle.isPending}
            onClick={() => {
              toggle.mutate(!link.disabled)
            }}
            size="sm"
          >
            {link.disabled ? t("admin.links.enable") : t("admin.links.disable")}
          </Button>
        }
        description={
          link.disabled
            ? t("admin.links.enableConsequence")
            : t("admin.links.disableConsequence")
        }
        title={
          link.disabled
            ? t("admin.links.enableTitle")
            : t("admin.links.disableTitle")
        }
        tone="warning"
      />

      <DangerZone
        action={
          <AdminAffiliateLinkDeleteDialog
            link={link}
            onDeleted={() => {
              navigate({ to: "/dashboard/admin/affiliate-links" })
            }}
          />
        }
        description={t("admin.links.deleteConsequence")}
        title={t("admin.links.deleteTitle")}
      />
    </div>
  )
}
