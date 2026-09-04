import { useQuery } from "@tanstack/react-query"
import { Server } from "lucide-react"
import { ServerRow } from "@/components/dashboard/server-row"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { serversQueryOptions } from "@/lib/api/queries"

export function ServerList() {
  const servers = useQuery(serversQueryOptions())

  if (servers.isPending) {
    return <LoadingState label="Lecture des serveurs de l'organisation…" />
  }

  if (servers.isError) {
    return (
      <Callout
        fix="Rechargez la page ; si cela persiste, vérifiez votre connexion."
        title="Les serveurs n'ont pas pu être lus."
        tone="danger"
      />
    )
  }

  if (servers.data.length === 0) {
    return (
      <EmptyState
        description="Enrôlez un VPS depuis l'app Pupitre : il apparaîtra ici dès son premier contact."
        icon={Server}
        title="Aucun serveur pour l'instant"
      />
    )
  }

  return (
    <div
      className="overflow-hidden rounded-md bg-surface shadow-raised"
      data-testid="server-list"
    >
      {servers.data.map((server) => (
        <ServerRow key={server.id} server={server} />
      ))}
    </div>
  )
}
