import { useQuery } from "@tanstack/react-query"
import { AdminAffiliateLinkForm } from "@/components/admin/admin-affiliate-link-form"
import { AdminAffiliateLinkRow } from "@/components/admin/admin-affiliate-link-row"
import { AdminFailure } from "@/components/admin/admin-failure"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import {
  type AffiliateLink,
  affiliateLinksQueryOptions,
  setAffiliateLinkDisabled,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { canActOnPlatform } from "@/lib/domain/admin"

interface ToggleTarget {
  id: string
  name: string
  disabled: boolean
}

export function AdminAffiliateLinkList() {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const links = useQuery(affiliateLinksQueryOptions())
  const acts = canActOnPlatform(platformRole)

  const toggle = useOptimisticMutation<ToggleTarget, AffiliateLink>({
    mutationFn: ({ id, disabled }) => setAffiliateLinkDisabled(id, disabled),
    patch: [
      patchQuery<AffiliateLink[], ToggleTarget>(
        queryKeys.admin.affiliateLinks,
        (previous, target) =>
          previous.map((link) =>
            link.id === target.id
              ? { ...link, disabled: target.disabled }
              : link
          )
      ),
    ],
    invalidate: [queryKeys.admin.affiliateLinks],
    toast: {
      done: (_data, target) =>
        t(
          target.disabled
            ? "admin.links.disabledDone"
            : "admin.links.enabledDone",
          { name: target.name }
        ),
      failed: () => ({
        title: t("admin.links.toggleFailed"),
        fix: t("admin.links.toggleFailedFix"),
      }),
    },
  })
  const toggling = toggle.isPending ? toggle.variables?.id : undefined

  return (
    <div className="flex flex-col gap-gutter">
      {links.isPending ? <SkeletonRows label={t("admin.reading")} /> : null}

      {links.isError ? (
        <AdminFailure
          fetching={links.isFetching}
          onRetry={() => {
            links.refetch()
          }}
        />
      ) : null}

      {links.isSuccess ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.links.title")}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {links.data.length}
            </span>
          </CardHeader>

          {links.data.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-ink-3">{t("admin.links.empty")}</p>
            </CardBody>
          ) : (
            <ul aria-busy={links.isFetching || undefined}>
              {links.data.map((link) => (
                <AdminAffiliateLinkRow
                  canAct={acts}
                  key={link.id}
                  link={link}
                  onToggle={(disabled) => {
                    toggle.mutate({ id: link.id, name: link.name, disabled })
                  }}
                  toggling={toggling === link.id}
                />
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {acts ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.links.create")}</CardTitle>
          </CardHeader>
          <CardBody>
            <AdminAffiliateLinkForm />
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
