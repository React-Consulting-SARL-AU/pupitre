import { useQuery } from "@tanstack/react-query"
import { Server } from "lucide-react"
import { AlertBanner } from "@/components/dashboard/alert-banner"
import { ServerRow } from "@/components/dashboard/server-row"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { useTranslations } from "@/hooks/use-locale"
import { serversQueryOptions } from "@/lib/api/queries"
import { countAlerts } from "@/lib/domain/alerts"

export function ServerList() {
  const t = useTranslations()
  const servers = useQuery(serversQueryOptions())

  if (servers.isPending) {
    return <LoadingState label={t("serverList.reading")} />
  }

  if (servers.isError) {
    return (
      <Callout
        fix={t("serverList.failedFix")}
        title={t("serverList.failed")}
        tone="danger"
      />
    )
  }

  if (servers.data.length === 0) {
    return (
      <EmptyState
        description={t("serverList.emptyDescription")}
        icon={Server}
        title={t("serverList.emptyTitle")}
      />
    )
  }

  return (
    <>
      <AlertBanner count={countAlerts(servers.data)} />
      <div
        className="overflow-hidden rounded-md bg-surface shadow-raised"
        data-testid="server-list"
      >
        {servers.data.map((server) => (
          <ServerRow key={server.id} server={server} />
        ))}
      </div>
    </>
  )
}
