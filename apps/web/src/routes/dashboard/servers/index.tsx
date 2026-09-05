import { createFileRoute } from "@tanstack/react-router"
import { ServerList } from "@/components/dashboard/server-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/servers/")({
  component: ServersPage,
})

function ServersPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/servers")

  return (
    <>
      <PageHeader
        description={t("page.servers.description")}
        parents={parents}
        title={t(title)}
      />
      <ServerList />
    </>
  )
}
