import { useQuery } from "@tanstack/react-query"
import { Archive } from "lucide-react"
import { useState } from "react"
import { backupColumns } from "@/components/dashboard/backup-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import { usePermission } from "@/hooks/use-permission"
import {
  type Backup,
  backupsQueryOptions,
  forgetBackup,
  queryKeys,
} from "@/lib/api/queries"
import { BACKUPS_PER_PAGE } from "@/lib/domain/backups"

export function BackupList() {
  const t = useTranslations()
  const canForget = usePermission("servers:delete")
  const backups = useQuery(backupsQueryOptions())
  const [offset, setOffset] = useState(0)

  const forget = useOptimisticMutation<Backup, void>({
    mutationFn: (backup) => forgetBackup(backup.id),
    patch: [
      patchQuery<Backup[], Backup>(queryKeys.backups, (list, target) =>
        list.filter((backup) => backup.id !== target.id)
      ),
    ],
    invalidate: [queryKeys.backups],
    toast: {
      done: (_data, target) =>
        t("backups.forgotten", { server: target.server_name }),
      failed: () => ({
        title: t("backups.forgetFailed"),
        fix: t("backups.forgetFailedFix"),
      }),
    },
  })
  const list = backups.data ?? []

  return (
    <AsyncDataTable
      columns={backupColumns(t, {
        canForget,
        forgetting: forget.isPending ? forget.variables?.id : undefined,
        onForget: (backup) => {
          forget.mutate(backup)
        },
      })}
      data={list.slice(offset, offset + BACKUPS_PER_PAGE)}
      emptyIcon={Archive}
      emptyTitle={t("backups.emptyTitle")}
      errorFix={t("backups.readFailedFix")}
      errorTitle={t("backups.readFailed")}
      isError={backups.isError}
      isFetching={backups.isFetching}
      isPending={backups.isPending}
      limit={BACKUPS_PER_PAGE}
      offset={offset}
      onOffsetChange={setOffset}
      refetch={() => {
        backups.refetch()
      }}
      rowKey={(backup) => backup.id}
      title={t("backups.listTitle")}
      total={list.length}
    />
  )
}
