import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { RotateCw } from "lucide-react"
import { FreshnessNotice } from "@/components/status/freshness-notice"
import { StatusRow } from "@/components/status/status-row"
import { Button } from "@/components/ui/button"
import { SkeletonLines } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { statusQueryOptions } from "@/lib/api/queries"
import {
  activeServersLabel,
  activeServersValue,
  healthLook,
  observationLabel,
  releaseLook,
} from "@/lib/domain/service-status"
import { formatDateTime } from "@/lib/utils/format"

export const Route = createFileRoute("/status")({
  component: StatusPage,
})

function StatusPage() {
  const t = useTranslations()
  const status = useQuery(statusQueryOptions())

  return (
    <main className="flex-1 bg-base px-8 py-16">
      <div className="mx-auto max-w-2xl">
        <header className="pb-section">
          <p className="text-label">{t("app.name")}</p>
          <h1 className="mt-1 font-bold font-display text-[26px] text-ink leading-[1.2] tracking-[-0.01em]">
            {t("statusPage.title")}
          </h1>
          <p className="mt-2 text-[14px] text-ink-2">{t("statusPage.lead")}</p>
        </header>

        {status.isPending ? (
          <div className="overflow-hidden rounded-md bg-surface shadow-raised">
            <SkeletonLines label={t("statusPage.reading")} rows={3} />
          </div>
        ) : null}

        {status.isError ? (
          <div className="rounded-md bg-surface shadow-raised">
            <ul>
              <StatusRow
                label={t("statusPage.api")}
                look={healthLook("down")}
              />
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-4 border-line border-t px-4 py-3">
              <p className="text-[13px] text-ink-2">
                {t("statusPage.unreachable")}
              </p>
              <Button
                icon={RotateCw}
                loading={status.isFetching}
                onClick={() => {
                  status.refetch()
                }}
                size="sm"
              >
                {t("common.retry")}
              </Button>
            </div>
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
              <StatusRow
                label={t("statusPage.api")}
                look={healthLook(status.data.api)}
              />
              <StatusRow
                label={t("statusPage.database")}
                look={healthLook(status.data.database)}
              />
              <StatusRow
                detail={status.data.latest_release?.version}
                label={t("statusPage.latestRelease")}
                look={releaseLook(Boolean(status.data.latest_release))}
              />
            </ul>
            <div className="flex items-baseline justify-between gap-4 border-line border-t px-4 py-3">
              <span className="text-[13px] text-ink-2">
                {activeServersLabel(status.data.freshness, t)}
              </span>
              <span
                className={`font-data text-[14px] tabular-nums ${
                  status.data.freshness === "fresh" ? "text-ink" : "text-ink-3"
                }`}
                data-testid="active-servers"
              >
                {activeServersValue(
                  status.data.freshness,
                  status.data.active_servers,
                  t
                )}
              </span>
            </div>
          </div>
        ) : null}

        <footer className="pt-gutter text-[12px] text-ink-3">
          {status.data
            ? `${t("statusPage.checkedAt", {
                date: formatDateTime(status.data.checked_at, t),
              })} ${observationLabel(
                status.data.freshness,
                status.data.last_observation_at,
                t
              )} `
            : ""}
          {t("statusPage.aggregated")}
        </footer>
      </div>
    </main>
  )
}
