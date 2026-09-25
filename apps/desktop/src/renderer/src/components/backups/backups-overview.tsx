import { useTranslations } from "@renderer/i18n/use-translations";
import { backupLabel } from "@renderer/lib/backups";
import {
  REVERT_PHASES,
  type RevertPhase,
  useBackups,
} from "@renderer/stores/backups";
import { useInstall } from "@renderer/stores/install";
import type { PlatformBackup } from "@shared/backups";
import { BackupsList } from "./backups-list";
import { BackupsRevertProgress } from "./backups-revert-progress";
import { BackupsRunOutcome } from "./backups-run-outcome";
import { BackupsStatus } from "./backups-status";

export function BackupsOverview({
  serverId,
  docker,
  withStatus,
  withList,
  busy,
  nameOf,
  onRevert,
}: {
  serverId: string;
  docker: boolean;
  withStatus: boolean;
  withList: boolean;
  busy: boolean;
  nameOf: (moduleId: string) => string;
  onRevert: (backup: PlatformBackup) => void;
}) {
  const t = useTranslations();

  const store = useBackups();
  const installing = useInstall((state) => state.modules);

  const { revert, run } = store;
  const verifying = revert.status === "running" && revert.phase === "verify";
  const progress =
    revert.status === "idle" || revert.status === "refused" || verifying
      ? null
      : revert;
  const listed = store.list.status === "read" ? store.list.backups : [];
  const reverted = listed.find((one) => one.id === progress?.backupId);
  const phases = REVERT_PHASES.filter(
    (phase: RevertPhase) =>
      phase !== "verify" &&
      (phase !== "save" || store.saveFirst) &&
      (phase !== "extra" || (store.setup?.extra.length ?? 0) > 0)
  );

  return (
    <>
      {progress ? (
        <BackupsRevertProgress
          installing={installing}
          named={reverted ? backupLabel(t, reverted) : ""}
          nameOf={nameOf}
          onDismiss={store.dismissRevert}
          onSettle={(uninstall) => store.settleExtra(serverId, uninstall)}
          phases={phases}
          revert={progress}
          steps={store.steps}
        />
      ) : null}

      {run.status === "idle" ? null : (
        <BackupsRunOutcome
          nameOf={nameOf}
          onDismiss={store.dismissRun}
          onRetry={() => store.runNow(serverId)}
          run={run}
          steps={store.steps}
        />
      )}

      {withStatus ? (
        <BackupsStatus
          docker={docker}
          onRetry={() => store.read(serverId)}
          state={store.state}
        />
      ) : null}

      {withList ? (
        <BackupsList
          busy={busy}
          list={store.list}
          onRemove={(backup) => store.remove(serverId, backup.id)}
          onRetry={() => store.read(serverId)}
          onRevert={onRevert}
          problem={store.problem}
        />
      ) : null}
    </>
  );
}
