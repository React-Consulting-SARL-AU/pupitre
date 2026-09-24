import { BackupConnectionCard } from "@renderer/components/connections/backup-connection-card";
import { BackupConnectionTextField } from "@renderer/components/connections/backup-connection-text-field";
import { descriptorOf } from "@renderer/components/connections/connection-descriptors";
import { ActionBar } from "@renderer/components/ui/action-bar";
import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { RadioGroup, RadioLine } from "@renderer/components/ui/radio";
import { Screen } from "@renderer/components/ui/screen";
import { Section } from "@renderer/components/ui/section";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { countsLabel } from "@renderer/lib/backups";
import { dated, weight } from "@renderer/lib/format";
import { useConnections } from "@renderer/stores/connections";
import { useOnboarding } from "@renderer/stores/onboarding";
import { useRestore } from "@renderer/stores/restore";
import { ArchiveRestore } from "lucide-react";
import { useState } from "react";

/**
 * A new server may start as another one was: its configuration, its secrets,
 * then — once installed and hardened — its data and its projects running.
 *
 * The backups are the organization's; the bucket is this computer's
 * connection, asked here when it is missing; the passphrase is checked on this
 * computer before the machine is asked anything.
 */
export function OnboardingRestoreScreen({
  serverName,
  onSkip,
}: {
  serverName?: string;
  onSkip: () => void;
}) {
  const t = useTranslations();

  const backups = useRestore((state) => state.backups);
  const setup = useRestore((state) => state.setup);
  const list = useRestore((state) => state.list);
  const restoreFrom = useOnboarding((state) => state.restoreFrom);
  const connected = useConnections(
    (state) => state.state.backup.status === "connected"
  );

  const listed = backups.status === "read" ? backups.backups : [];
  const [chosen, setChosen] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");

  const picked = chosen ?? listed[0]?.id ?? null;
  const running = setup.status === "running";
  const connection = descriptorOf("backup");

  let note: string | null = null;

  if (!connected) {
    note = t("onboarding.restore.needsConnection");
  } else if (passphrase.trim() === "") {
    note = t("onboarding.restore.needsPassphrase");
  }

  return (
    <Screen
      column
      eyebrow={serverName ?? t("onboarding.thisServer")}
      footer={
        <ActionBar name="restore" note={note}>
          <Button disabled={running} onClick={onSkip} variant="discreet">
            {t("onboarding.restore.skip")}
          </Button>
          <Button
            disabled={!(picked && connected) || passphrase.trim() === ""}
            icon={ArchiveRestore}
            loading={running}
            onClick={() =>
              picked ? restoreFrom(picked, passphrase) : undefined
            }
            variant="inverse"
          >
            {t("onboarding.restore.start")}
          </Button>
        </ActionBar>
      }
      plain
      step="restore"
      title={t("onboarding.restore.title")}
    >
      <Section title={t("onboarding.restore.backups")}>
        {backups.status === "loading" || backups.status === "idle" ? (
          <SkeletonRows framed rows={3} />
        ) : null}

        {backups.status === "failed" ? (
          <ErrorNotice error={backups.error} onRetry={() => list()} />
        ) : null}

        {picked ? (
          <Panel inset="sm">
            <RadioGroup
              className="flex flex-col"
              label={t("onboarding.restore.backups")}
              name="restore-backup"
              onChange={setChosen}
              value={picked}
            >
              {listed.map((backup) => (
                <RadioLine
                  data-restore-backup={backup.id}
                  detail={`${weight(backup.bytes)} · ${countsLabel(t, backup.counts)}`}
                  key={backup.id}
                  label={t("onboarding.restore.backupLabel", {
                    date: dated(backup.created_at),
                    server: backup.server_name,
                  })}
                  value={backup.id}
                />
              ))}
            </RadioGroup>
          </Panel>
        ) : null}
      </Section>

      {connected || !connection ? null : (
        <Section title={t("connections.backup.title")}>
          <Panel inset="lg">
            <BackupConnectionCard compact connection={connection} />
          </Panel>
        </Section>
      )}

      <Section title={t("backups.passphrase.label")}>
        <Panel inset="lg">
          <BackupConnectionTextField
            help={t("onboarding.restore.passphraseHelp")}
            kind="prose"
            label={t("backups.passphrase.label")}
            name="restore-passphrase"
            onChange={setPassphrase}
            secret
            value={passphrase}
          />
        </Panel>
      </Section>

      {running ? (
        <WaitingNotice title={t("onboarding.restore.running")} />
      ) : null}

      {setup.status === "failed" ? <ErrorNotice error={setup.error} /> : null}
    </Screen>
  );
}
