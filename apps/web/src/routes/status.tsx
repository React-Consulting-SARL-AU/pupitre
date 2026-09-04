import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FreshnessNotice } from "@/components/status/freshness-notice"
import { StatusDot } from "@/components/ui/status-dot"
import { statusQueryOptions } from "@/lib/api/queries"
import type { StatusLook } from "@/lib/domain/server-status"
import {
  activeServersLabel,
  activeServersValue,
  observationLabel,
} from "@/lib/domain/service-status"
import { formatDateTime } from "@/lib/utils/format"

export const Route = createFileRoute("/status")({
  component: StatusPage,
})

const HEALTH_LOOKS: Record<string, StatusLook> = {
  ok: { shape: "filled", tone: "ok", label: "Répond" },
  down: { shape: "barred", tone: "danger", label: "Ne répond pas" },
}

function healthLook(health: string): StatusLook {
  return HEALTH_LOOKS[health] ?? HEALTH_LOOKS.down
}

function Row({
  label,
  look,
  detail,
}: {
  label: string
  look: StatusLook
  detail?: string
}) {
  return (
    <li className="flex items-center gap-3 border-line border-b px-4 py-3 last:border-b-0">
      <StatusDot label={look.label} shape={look.shape} tone={look.tone} />
      <span className="flex-1 text-[14px] text-ink">{label}</span>
      <span className="text-[13px] text-ink-2">{look.label}</span>
      {detail ? (
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {detail}
        </span>
      ) : null}
    </li>
  )
}

function StatusPage() {
  const status = useQuery(statusQueryOptions())

  return (
    <main className="min-h-screen bg-base px-8 py-16">
      <div className="mx-auto max-w-2xl">
        <header className="pb-section">
          <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            Pupitre
          </p>
          <h1 className="mt-1 font-bold font-display text-[26px] text-ink leading-[1.2] tracking-[-0.01em]">
            État du service
          </h1>
          <p className="mt-2 text-[14px] text-ink-2">
            L'état de la plateforme Pupitre, pas celui de vos serveurs. Ceux-ci
            se lisent dans votre console, après connexion.
          </p>
        </header>

        {status.isPending ? (
          <p className="text-[13px] text-ink-3">
            Lecture de l'état du service…
          </p>
        ) : null}

        {status.isError ? (
          <div className="rounded-md bg-surface shadow-raised">
            <ul>
              <Row label="API" look={healthLook("down")} />
            </ul>
            <p className="border-line border-t px-4 py-3 text-[13px] text-ink-2">
              La page n'a pas obtenu de réponse. Rechargez dans une minute.
            </p>
          </div>
        ) : null}

        {status.data ? (
          <FreshnessNotice
            freshness={status.data.freshness}
            lastObservationAt={status.data.last_observation_at}
          />
        ) : null}

        {status.data ? (
          <div className="rounded-md bg-surface shadow-raised">
            <ul>
              <Row label="API" look={healthLook(status.data.api)} />
              <Row
                label="Base de données"
                look={healthLook(status.data.database)}
              />
              <Row
                detail={status.data.latest_release?.version ?? "—"}
                label="Dernière version publiée de l'agent"
                look={
                  status.data.latest_release
                    ? healthLook("ok")
                    : { shape: "hollow", tone: "muted", label: "Aucune" }
                }
              />
            </ul>
            <div className="flex items-baseline justify-between gap-4 border-line border-t px-4 py-3">
              <span className="text-[13px] text-ink-2">
                {activeServersLabel(status.data.freshness)}
              </span>
              <span
                className={`font-data text-[14px] tabular-nums ${
                  status.data.freshness === "fresh" ? "text-ink" : "text-ink-3"
                }`}
                data-testid="active-servers"
              >
                {activeServersValue(
                  status.data.freshness,
                  status.data.active_servers
                )}
              </span>
            </div>
          </div>
        ) : null}

        <footer className="pt-gutter text-[12px] text-ink-3">
          {status.data
            ? `Relevé le ${formatDateTime(status.data.checked_at)}. ${observationLabel(
                status.data.freshness,
                status.data.last_observation_at
              )} `
            : ""}
          Ce compteur est agrégé : il ne dit rien d'aucun client.
        </footer>
      </div>
    </main>
  )
}
