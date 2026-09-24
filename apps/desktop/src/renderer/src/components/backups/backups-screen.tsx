import { BACKUP_MODULE_ID } from "@pupitre/shared/backup";
import { Button } from "@renderer/components/ui/button";
import { Screen } from "@renderer/components/ui/screen";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { useTranslations } from "@renderer/i18n/use-translations";
import { poll } from "@renderer/lib/poll";
import { useBackups } from "@renderer/stores/backups";
import { useServices } from "@renderer/stores/services";
import type { PlatformBackup } from "@shared/backups";
import { HardDriveUpload } from "lucide-react";
import { useEffect, useState } from "react";
import { BackupsNameDialog } from "./backups-name-dialog";
import { BackupsOverview } from "./backups-overview";
import { BackupsRevertDialog } from "./backups-revert-dialog";
import { BackupsSettings } from "./backups-settings";
import { BackupsSetup } from "./backups-setup";
import { BackupsStatus } from "./backups-status";
import { type BackupsTab, BackupsTabs } from "./backups-tabs";

/** A scheduled backup starts on its own: the state is read again while the page is open. */
const STATUS_POLL_MS = 10_000;

/**
 * A server's backups.
 *
 * A server without backups yet walks a setup, one question at a time. Once
 * they are on, the page is a column of tabs: the dashboard — a backup under
 * way, the last one, the next, and every backup to go back to — then the
 * frequency, the content and the destination, each its own pane of
 * `core.backup`'s settings.
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

  const [asking, setAsking] = useState<PlatformBackup | null>(null);
  const [tab, setTab] = useState<BackupsTab>("overview");
  const [naming, setNaming] = useState(false);

  const { read, refresh, manifest, revert, runNow: run } = store;
  const manifestId = manifest?.id ?? null;
  const configured =
    store.state.status === "read" && store.state.backup.configured;
  const settingUp =
    store.state.status === "read" && !store.state.backup.configured;

  useEffect(() => {
    setTab("overview");
    read(serverId);
  }, [serverId, read]);

  useEffect(() => {
    if (configured) {
      return poll(() => refresh(serverId), STATUS_POLL_MS);
    }
  }, [configured, serverId, refresh]);

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
  const reverting = !(
    revert.status === "idle" ||
    revert.status === "refused" ||
    verifying
  );

  // The dialog has done its part once the passphrase is known good: the
  // revert goes on on the dashboard, and nothing typed in it is kept.
  useEffect(() => {
    if (reverting) {
      setAsking(null);
      setTab("overview");
    }
  }, [reverting]);

  const busy =
    revert.status === "running" ||
    revert.status === "choosing" ||
    store.run.status === "running" ||
    store.removing !== null;
  const listed = store.list.status === "read" ? store.list.backups : [];
  const docker = installed.includes("runtime.docker");

  function nameOf(moduleId: string): string {
    return (
      store.modules.find((module) => module.id === moduleId)?.name ?? moduleId
    );
  }

  function runNamed(name: string | undefined): Promise<void> {
    setNaming(false);
    setTab("overview");

    return run(serverId, name);
  }

  async function activated(runFirst: boolean): Promise<void> {
    setTab("overview");
    await read(serverId);

    if (runFirst) {
      await run(serverId);
    }
  }

  const overview = (
    <BackupsOverview
      busy={busy}
      docker={docker}
      nameOf={nameOf}
      onRevert={setAsking}
      serverId={serverId}
      withList={configured || listed.length > 0}
      withStatus={configured}
    />
  );

  const settings =
    tab !== "overview" && manifest ? (
      <BackupsSettings
        contents={store.contents}
        manifest={manifest}
        nameOf={nameOf}
        onRetryContents={() => read(serverId)}
        pane={tab}
        serverId={serverId}
      />
    ) : null;

  return (
    <Screen
      actions={
        configured ? (
          <Button
            disabled={busy}
            icon={HardDriveUpload}
            loading={store.run.status === "running"}
            onClick={() => setNaming(true)}
            variant="inverse"
          >
            {t("backups.run.now")}
          </Button>
        ) : null
      }
      eyebrow={serverName}
      title={t("backups.title")}
    >
      {configured ? (
        <BackupsTabs onTab={setTab} tab={tab}>
          {tab === "overview" ? overview : settings}
        </BackupsTabs>
      ) : null}

      {settingUp && manifest ? (
        <BackupsSetup
          contents={store.contents}
          docker={docker}
          manifest={manifest}
          nameOf={nameOf}
          onActivated={activated}
          onRetryContents={() => read(serverId)}
          serverId={serverId}
        />
      ) : null}

      {settingUp && !manifest ? <SkeletonRows framed rows={5} /> : null}

      {settingUp ? overview : null}

      {configured || settingUp ? null : (
        <BackupsStatus
          docker={docker}
          onRetry={() => read(serverId)}
          state={store.state}
        />
      )}

      <BackupsNameDialog
        onClose={() => setNaming(false)}
        onConfirm={runNamed}
        open={naming}
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
