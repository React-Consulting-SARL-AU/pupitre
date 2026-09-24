import type { Manifest } from "@pupitre/shared/catalog";
import { BackupConnectionForm } from "@renderer/components/connections/backup-connection-form";
import { descriptorOf } from "@renderer/components/connections/connection-descriptors";
import { ServiceConfigOutcome } from "@renderer/components/services/service-config-outcome";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { strayProblems } from "@renderer/i18n/field-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import { driftsFrom } from "@renderer/lib/backup-providers";
import { useFingerprint } from "@renderer/lib/use-fingerprint";
import { useBackupConnection } from "@renderer/stores/backup-connection";
import { useServices } from "@renderer/stores/services";
import type { AgentError } from "@shared/agent";
import type { BackupStorage } from "@shared/backups";
import { Pencil, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { BackupsReset } from "./backups-reset";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The bucket a server backs up to, as its own values name it. */
function serverStorage(values: Record<string, unknown>): BackupStorage {
  return {
    access_key_id: text(values.access_key_id),
    bucket: text(values.bucket),
    endpoint: text(values.endpoint),
    path_style: values.path_style !== false,
    prefix: text(values.prefix),
    region: text(values.region),
  };
}

/**
 * Where this server's backups go, as the server holds it — and the one place
 * the bucket and its key are changed. A change is kept on this computer, then
 * applied to the server at once, secret key included: nothing waits for an
 * Apply found on another tab. Below, the way to take backups off the server
 * and set them up again.
 */
export function BackupsDestination({
  serverId,
  manifest,
  nameOf,
  onReset,
}: {
  serverId: string;
  manifest: Manifest;
  nameOf: (moduleId: string) => string;
  onReset: (forgetConnection: boolean) => Promise<AgentError | null>;
}) {
  const t = useTranslations();

  const connection = descriptorOf("backup");
  const held = useBackupConnection((state) => state.held);
  const readConnection = useBackupConnection((state) => state.read);
  const store = useServices();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    readConnection();
  }, [readConnection]);

  const { config, apply, steps } = store;
  const baseline = config.status === "ready" ? config.baseline : {};
  const server = serverStorage(baseline);
  const fingerprint = useFingerprint(text(baseline.recipient) || null);
  const view = held.status === "read" ? held.view : null;
  const drifting = view !== null && driftsFrom(view, baseline);
  const running = apply.status === "running";
  const refused = strayProblems(t, store.shown(), [], manifest);

  function applyHeld(): Promise<void> {
    return store.reconfigure(serverId, manifest.id);
  }

  async function savedThenApplied(): Promise<void> {
    setEditing(false);
    await applyHeld();
  }

  return (
    <>
      <Section
        actions={
          editing || !connection ? null : (
            <Button icon={Pencil} onClick={() => setEditing(true)} size="sm">
              {t("backups.destination.edit")}
            </Button>
          )
        }
        name="backup-destination"
        title={t("backups.destination.title")}
      >
        {view === null && held.status === "read" ? (
          <Callout name="backup-no-key" tone="warn">
            {t("backups.destination.noKey")}
          </Callout>
        ) : null}

        {drifting && !editing ? (
          <Callout
            action={
              <Button
                icon={RefreshCw}
                loading={running}
                onClick={applyHeld}
                size="sm"
                variant="inverse"
              >
                {t("backups.destination.applyHeld")}
              </Button>
            }
            name="backup-drift"
            tone="warn"
          >
            {t("backups.destination.drift")}
          </Callout>
        ) : null}

        {editing && connection ? (
          <Panel inset="lg">
            <BackupConnectionForm
              connection={connection}
              initial={view}
              onCancel={() => setEditing(false)}
              onSaved={savedThenApplied}
              saveLabel={t("backups.destination.saveAndApply")}
              start={view ? undefined : server}
            />
          </Panel>
        ) : (
          <Panel className="flex flex-col gap-5" inset="lg">
            <FactList columns={2}>
              <Fact label={t("backups.field.bucket")}>{server.bucket}</Fact>
              <Fact label={t("backups.field.endpoint")}>{server.endpoint}</Fact>
              <Fact label={t("backups.field.accessKeyId")}>
                {server.access_key_id}
              </Fact>
              <Fact
                detail={t("backups.connection.fingerprintDetail")}
                label={t("backups.connection.fingerprint")}
              >
                {fingerprint}
              </Fact>
            </FactList>

            {view && !drifting ? (
              <div>
                <Button
                  icon={RefreshCw}
                  loading={running}
                  onClick={applyHeld}
                  size="sm"
                  variant="discreet"
                >
                  {t("backups.destination.resend")}
                </Button>
              </div>
            ) : null}
          </Panel>
        )}

        {refused.length > 0 && !running ? (
          <Callout name="backup-destination-refused" tone="danger">
            <ul className="flex flex-col gap-1">
              {refused.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        <ServiceConfigOutcome
          apply={apply}
          name={manifest.name}
          nameOf={nameOf}
          secretsDropped={store.secretsDropped}
          steps={steps}
        />
      </Section>

      <BackupsReset onReset={onReset} />
    </>
  );
}
