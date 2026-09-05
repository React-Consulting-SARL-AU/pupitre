import { createFileRoute } from "@tanstack/react-router"
import { MemberList } from "@/components/dashboard/member-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/members")({
  component: MembersPage,
})

function MembersPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/members")

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
