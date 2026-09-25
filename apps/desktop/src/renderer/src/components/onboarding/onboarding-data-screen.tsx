import { BackupsRestoreResult } from "@renderer/components/backups/backups-restore-result";
import { BackupConnectionTextField } from "@renderer/components/connections/backup-connection-text-field";
import { InstallProgress } from "@renderer/components/install/install-progress";
import { ActionBar } from "@renderer/components/ui/action-bar";
import { Button } from "@renderer/components/ui/button";
import { CheckLine } from "@renderer/components/ui/check-line";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Screen } from "@renderer/components/ui/screen";
import { Section } from "@renderer/components/ui/section";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { partLabel } from "@renderer/lib/backups";
import { useOnboarding } from "@renderer/stores/onboarding";
import { useRestore } from "@renderer/stores/restore";
import { ArrowRight, DatabaseBackup } from "lucide-react";
import { useState } from "react";

export function OnboardingDataScreen({
  serverName,
  onContinue,
}: {
  serverName?: string;
  onContinue: () => void;
}) {
  const t = useTranslations();

  const restored = useRestore((state) => state.restored);
  const data = useRestore((state) => state.data);
  const steps = useRestore((state) => state.steps);
  const bringData = useOnboarding((state) => state.bringData);
  const skipData = useOnboarding((state) => state.skipData);

  const parts = restored?.parts ?? [];
  const [unticked, setUnticked] = useState<readonly string[]>([]);
  const [passphrase, setPassphrase] = useState("");

  const chosen = parts
    .map((part) => part.key)
    .filter((key) => !unticked.includes(key));
  const running = data.status === "running";
  const done = data.status === "done";
  const asksPassphrase =
    data.status === "failed" &&
    data.error.phrase?.id === "refusal.backup.passphrase.needed";

  function tick(key: string, next: boolean): void {
    setUnticked((held) =>
      next ? held.filter((one) => one !== key) : [...held, key]
    );
  }

  return (
    <Screen
      column
      eyebrow={serverName ?? t("onboarding.thisServer")}
      footer={
        <ActionBar name="data">
          {done ? (
            <Button icon={ArrowRight} onClick={onContinue} variant="inverse">
              {t("onboarding.data.continue")}
            </Button>
          ) : (
            <>
              <Button disabled={running} onClick={skipData} variant="discreet">
                {t("onboarding.data.skip")}
              </Button>
              <Button
                disabled={
                  chosen.length === 0 || (asksPassphrase && !passphrase)
                }
                icon={DatabaseBackup}
                loading={running}
                onClick={() =>
                  bringData(chosen, asksPassphrase ? passphrase : null)
                }
                variant="inverse"
              >
                {t.plural("onboarding.data.start", chosen.length)}
              </Button>
            </>
          )}
        </ActionBar>
      }
      plain
      step="data"
      title={t("onboarding.data.title")}
    >
      {done ? null : (
        <Section title={t("onboarding.data.parts")}>
          <Panel className="flex flex-col gap-2" inset="lg">
            {parts.map((part) => (
              <CheckLine
                checked={!unticked.includes(part.key)}
                disabled={running}
                key={part.key}
                label={partLabel(t, part)}
                name={`restore-part-${part.key}`}
                onChange={(next) => tick(part.key, next)}
              />
            ))}
          </Panel>
        </Section>
      )}

      {asksPassphrase ? (
        <Panel inset="lg">
          <BackupConnectionTextField
            help={t("onboarding.data.passphraseHelp")}
            kind="prose"
            label={t("backups.passphrase.label")}
            name="data-passphrase"
            onChange={setPassphrase}
            secret
            value={passphrase}
          />
        </Panel>
      ) : null}

      {running ? <WaitingNotice title={t("onboarding.data.running")} /> : null}

      {data.status === "failed" && !asksPassphrase ? (
        <ErrorNotice error={data.error} />
      ) : null}

      {data.status === "done" ? (
        <BackupsRestoreResult
          headline={t("onboarding.data.done")}
          result={data.result}
        />
      ) : null}

      {steps.length > 0 ? (
        <InstallProgress
          modules={steps}
          nameOf={() => t("backups.title")}
          wording="restore"
        />
      ) : null}
    </Screen>
  );
}
