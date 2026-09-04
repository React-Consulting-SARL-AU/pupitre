import { createFileRoute } from "@tanstack/react-router"
import { ServerList } from "@/components/dashboard/server-list"
import { PageHeader } from "@/components/ui/page-header"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/servers/")({
  component: ServersPage,
})

function ServersPage() {
  const { title, parents } = pageTitle("/dashboard/servers")

  return (
    <>
      <PageHeader
        description="Les serveurs enrôlés de l'organisation active. La liste se rafraîchit toute seule."
        parents={parents}
        title={title}
      />
      <ServerList />
    </>
  )
}
