import { BACKUP_MODULE_ID } from "@pupitre/shared/backup";
import { BackupConnectionCard } from "@renderer/components/connections/backup-connection-card";
import { descriptorOf } from "@renderer/components/connections/connection-descriptors";
import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import { Screen } from "@renderer/components/ui/screen";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { dated } from "@renderer/lib/format";
import {
  REVERT_PHASES,
  type RevertPhase,
  useBackups,
} from "@renderer/stores/backups";
import { useConnections } from "@renderer/stores/connections";
import { useInstall } from "@renderer/stores/install";
import { useServices } from "@renderer/stores/services";
import type { PlatformBackup } from "@shared/backups";
import { HardDriveUpload } from "lucide-react";
import { useEffect, useState } from "react";
import { BackupsList } from "./backups-list";
import { BackupsRevertDialog } from "./backups-revert-dialog";
import { BackupsRevertProgress } from "./backups-revert-progress";
import { BackupsRunOutcome } from "./backups-run-outcome";
import { BackupsSettings } from "./backups-settings";
import { BackupsStatus } from "./backups-status";

/**
 * A server's backups: where they stand, where they go, how often, and the
 * ones that exist — each one a state the server can be taken back to.
 *
 * The settings are `core.backup`'s own form, the one the services page draws
 * for any module; the bucket is the connection this computer holds, asked here
 * when it is missing.
 */
export function BackupsScreen({
  serverId,
  serverName,
  installed,
}: {
  serverId: string;
  serverName?: string;
  /** The modules the snapshot lists, for what Docker leaves out. */
  installed: readonly string[];
}) {
  const t = useTranslations();

  const store = useBackups();
  const applied = useServices((state) => state.apply.status === "done");
  const installing = useInstall((state) => state.modules);
  const connected = useConnections(
    (state) => state.state.backup.status === "connected"
  );
  const readConnections = useConnections((state) => state.read);

  const [asking, setAsking] = useState<PlatformBackup | null>(null);

  const { read, manifest, revert, run } = store;
  const manifestId = manifest?.id ?? null;

  useEffect(() => {
    read(serverId);
    readConnections();
  }, [serverId, read, readConnections]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the form opens once the module's manifest is known, not on every catalogue object
  useEffect(() => {
    if (!manifestId) {
      return;
    }

    useServices.getState().open(serverId, BACKUP_MODULE_ID, manifest);

    return () => {
      useServices.getState().close(serverId);
    };
  }, [serverId, manifestId]);

  useEffect(() => {
    if (applied) {
      read(serverId);
    }
  }, [applied, serverId, read]);

  const verifying = revert.status === "running" && revert.phase === "verify";
  const progress =
    revert.status === "idle" || revert.status === "refused" || verifying
      ? null
      : revert;
  const reverting = progress !== null;

  // The dialog has done its part once the passphrase is known good: the
  // revert goes on on the page, and nothing typed in it is kept.
  useEffect(() => {
    if (reverting) {
      setAsking(null);
    }
  }, [reverting]);

  const configured =
    store.state.status === "read" && store.state.backup.configured;
  const busy =
    revert.status === "running" ||
    revert.status === "choosing" ||
    run.status === "running" ||
    store.removing !== null;
  const listed = store.list.status === "read" ? store.list.backups : [];
  const reverted = listed.find((one) => one.id === progress?.backupId);
  const when = reverted ? dated(reverted.created_at) : "";
  const phases = REVERT_PHASES.filter(
    (phase: RevertPhase) =>
      phase !== "verify" &&
      (phase !== "save" || store.saveFirst) &&
      (phase !== "extra" || (store.setup?.extra.length ?? 0) > 0)
  );
  const connection = descriptorOf("backup");

  function nameOf(moduleId: string): string {
    return (
      store.modules.find((module) => module.id === moduleId)?.name ?? moduleId
    );
  }

  return (
    <Screen
      actions={
        <Button
          disabled={!configured || busy}
          icon={HardDriveUpload}
          loading={run.status === "running"}
          onClick={() => store.runNow(serverId)}
          variant="inverse"
        >
          {t("backups.run.now")}
        </Button>
      }
      eyebrow={serverName}
      title={t("backups.title")}
    >
      {progress ? (
        <BackupsRevertProgress
          installing={installing}
          nameOf={nameOf}
          onDismiss={store.dismissRevert}
          onSettle={(uninstall) => store.settleExtra(serverId, uninstall)}
          phases={phases}
          revert={progress}
          steps={store.steps}
          when={when}
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

      <BackupsStatus
        docker={installed.includes("runtime.docker")}
        onRetry={() => read(serverId)}
        state={store.state}
      />

      {connected || !connection ? null : (
        <Section name="backup-connection" title={t("connections.backup.title")}>
          <Panel inset="lg">
            <BackupConnectionCard compact connection={connection} />
          </Panel>
        </Section>
      )}

      {manifest ? (
        <BackupsSettings
          configured={configured}
          contents={store.contents}
          manifest={manifest}
          nameOf={nameOf}
          onRetryContents={() => read(serverId)}
          serverId={serverId}
        />
      ) : null}

      <BackupsList
        busy={busy}
        list={store.list}
        onRemove={(backup) => store.remove(serverId, backup.id)}
        onRetry={() => read(serverId)}
        onRevert={setAsking}
        problem={store.problem}
      />

      {asking && !reverting ? (
        <BackupsRevertDialog
          backup={asking}
          checking={verifying}
          key={asking.id}
          onClose={() => {
            setAsking(null);
            store.dismissRevert();
          }}
          onConfirm={(passphrase, saveFirst) =>
            store.revertTo(serverId, asking, passphrase, saveFirst)
          }
          refusal={revert.status === "refused" ? revert.error : null}
        />
      ) : null}
    </Screen>
  );
}
