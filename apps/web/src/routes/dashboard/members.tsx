import { createFileRoute } from "@tanstack/react-router"
import { MemberList } from "@/components/dashboard/member-list"
import { PageHeader } from "@/components/ui/page-header"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/members")({
  component: MembersPage,
})

function MembersPage() {
  const { title, parents } = pageTitle("/dashboard/members")

  return (
    <>
      <PageHeader
        description="Qui travaille dans cette organisation, et à quel titre. Un membre ne voit que les serveurs qui lui sont attribués ; un administrateur les voit tous et les attribue."
        parents={parents}
        title={title}
      />
      <MemberList />
    </>
  )
}
