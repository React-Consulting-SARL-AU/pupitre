import { createFileRoute } from "@tanstack/react-router"
import { MemberList } from "@/components/dashboard/member-list"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { PageSkeleton } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { type Me, membersQueryOptions, queryKeys } from "@/lib/api/queries"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/members"

export const Route = createFileRoute("/dashboard/members")({
  component: MembersPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  loader: async ({ context }) => {
    const organizationId = context.queryClient.getQueryData<Me>(queryKeys.me)
      ?.active_organization?.id

    if (organizationId) {
      await context.queryClient.ensureQueryData(
        membersQueryOptions(organizationId)
      )
    }
  },
  pendingComponent: MembersPending,
})

function MembersPending() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <PageSkeleton
      description={t("page.members.description")}
      parents={parents}
      shape="cards"
      title={t(title)}
    />
  )
}

function MembersPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader
        description={t("page.members.description")}
        parents={parents}
        title={t(title)}
      />
      <MemberList />
    </>
  )
}
