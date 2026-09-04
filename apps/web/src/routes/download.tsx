import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { DownloadPanel } from "@/components/download/download-panel"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { meQueryOptions } from "@/lib/api/queries"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/download")({
  component: DownloadPage,
})

function DownloadPage() {
  const { title, parents } = pageTitle("/download")
  const me = useQuery(meQueryOptions())

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base">
        <LoadingState label="Ouverture du téléchargement…" />
      </div>
    )
  }

  if (me.isError) {
    return <Navigate to="/auth/sign-in" />
  }

  return (
    <main className="min-h-screen bg-base px-8 py-8">
      <div className="mx-auto max-w-3xl">
        <Link
          className="mb-gutter inline-flex items-center gap-2 text-[13px] text-ink-2 transition-colors duration-[120ms] ease-[ease] hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          to="/dashboard/servers"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          Retour à la console
        </Link>

        <PageHeader
          description="L'app tourne sur votre machine et parle à vos serveurs en SSH. Aucune clé privée ne quitte votre laptop."
          parents={parents}
          title={title}
        />
        <DownloadPanel />
      </div>
    </main>
  )
}
