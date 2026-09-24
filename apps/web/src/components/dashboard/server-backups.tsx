import { useQuery } from "@tanstack/react-query"
import { RotateCw } from "lucide-react"
import { ServerBackupBeat } from "@/components/dashboard/server-backup-beat"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonLines } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { type ServerDetail, serverBackupsQueryOptions } from "@/lib/api/queries"
import {
  formatBackupContents,
  formatBytes,
  formatDateTime,
} from "@/lib/utils/format"

export interface ServerBackupsProps {
  serverId: string
  beat: ServerDetail["backup"]
}

export function ServerBackups({ serverId, beat }: ServerBackupsProps) {
  const t = useTranslations()
  const backups = useQuery(serverBackupsQueryOptions(serverId))
  const list = backups.data ?? []

  return (
    <Card data-testid="server-backups">
      <CardHeader>
        <CardTitle>{t("backups.title")}</CardTitle>
      </CardHeader>

      {beat ? (
        <ServerBackupBeat beat={beat} />
      ) : (
        <CardBody>
          <p className="text-[13px] text-ink">{t("backups.notConfigured")}</p>
          <p className="mt-1 text-[13px] text-ink-3">
            {t("backups.notConfiguredFix")}
          </p>
        </CardBody>
      )}

      {backups.isPending ? (
        <SkeletonLines label={t("backups.reading")} rows={2} />
      ) : null}

      {backups.isError ? (
        <CardBody>
          <Callout
            action={
              <Button
                icon={RotateCw}
                loading={backups.isFetching}
                onClick={() => {
                  backups.refetch()
                }}
                size="sm"
              >
                {t("common.retry")}
              </Button>
            }
            fix={t("backups.readFailedFix")}
            title={t("backups.readFailed")}
            tone="danger"
          />
        </CardBody>
      ) : null}

      {backups.isSuccess && list.length === 0 ? (
        <CardBody className="border-line border-t">
          <p className="text-[13px] text-ink-3">{t("backups.empty")}</p>
        </CardBody>
      ) : null}

      {list.length > 0 ? (
        <ul className="border-line border-t">
          {list.map((backup) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0"
              key={backup.id}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink">
                  {backup.name ? (
                    <>
                      {backup.name}{" "}
                      <span className="text-ink-3">
                        · {formatDateTime(backup.created_at, t)}
                      </span>
                    </>
                  ) : (
                    formatDateTime(backup.created_at, t)
                  )}
                </p>
                <p className="truncate text-[12px] text-ink-3">
                  {t(`backups.trigger.${backup.trigger}`)} ·{" "}
                  {formatBackupContents(backup.counts, t)}
                </p>
              </div>
              <span className="font-data text-[12px] text-ink-2 tabular-nums">
                {formatBytes(backup.bytes, t)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
