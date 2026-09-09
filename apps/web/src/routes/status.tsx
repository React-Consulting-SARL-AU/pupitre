import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { RotateCw } from "lucide-react"
import { FreshnessNotice } from "@/components/status/freshness-notice"
import { Button } from "@/components/ui/button"
import { SkeletonLines } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
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
  ok: { shape: "filled", tone: "ok", label: "service.responds" },
  down: { shape: "barred", tone: "danger", label: "service.doesNotRespond" },
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
  const t = useTranslations()

  return (
    <li className="flex items-center gap-3 border-line border-b px-4 py-3 last:border-b-0">
      <StatusDot label={t(look.label)} shape={look.shape} tone={look.tone} />
      <span className="flex-1 text-[14px] text-ink">{label}</span>
      <span className="text-[13px] text-ink-2">{t(look.label)}</span>
      {detail ? (
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {detail}
        </span>
      ) : null}
    </li>
  )
}

function StatusPage() {
  const t = useTranslations()
  const status = useQuery(statusQueryOptions())

  return (
    <main className="flex-1 bg-base px-8 py-16">
      <div className="mx-auto max-w-2xl">
        <header className="pb-section">
          <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            {t("app.name")}
          </p>
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
              <Row label={t("statusPage.api")} look={healthLook("down")} />
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
              <Row
                label={t("statusPage.api")}
                look={healthLook(status.data.api)}
              />
              <Row
                label={t("statusPage.database")}
                look={healthLook(status.data.database)}
              />
              <Row
                detail={status.data.latest_release?.version ?? t("format.none")}
                label={t("statusPage.latestRelease")}
                look={
                  status.data.latest_release
                    ? healthLook("ok")
                    : {
                        shape: "hollow",
                        tone: "muted",
                        label: "statusPage.noRelease",
                      }
                }
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
