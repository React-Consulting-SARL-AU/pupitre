import type { Manifest } from "@pupitre/shared/catalog";
import type { FieldProblem } from "@pupitre/shared/catalog/validate";
import { descriptorOf } from "@renderer/components/connections/connection-descriptors";
import { ServiceConfigOutcome } from "@renderer/components/services/service-config-outcome";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { problemText, strayProblems } from "@renderer/i18n/field-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  NO_PHRASE,
  type PhraseDraft,
  phraseReady,
} from "@renderer/lib/backup-passphrase";
import {
  type BackupProvider,
  providerOf,
  storageOf,
  storageProblems,
} from "@renderer/lib/backup-providers";
import {
  BACKUP_SETUP_STEPS,
  type BackupSetupStep,
  CONTENT_FIELDS,
  FREQUENCY_FIELDS,
  fieldsOf,
  stepOfField,
} from "@renderer/lib/backup-setup";
import { useBackupConnection } from "@renderer/stores/backup-connection";
import type { ContentsState } from "@renderer/stores/backups";
import { useServices } from "@renderer/stores/services";
import type { BackupStorage } from "@shared/backups";
import { useEffect, useState } from "react";
import { BackupsFrequencyFields } from "./backups-frequency-fields";
import { BackupsSetupBucket } from "./backups-setup-bucket";
import { BackupsSetupContent } from "./backups-setup-content";
import { BackupsSetupFooter } from "./backups-setup-footer";
import { BackupsSetupPassphrase } from "./backups-setup-passphrase";
import { BackupsSetupProgress } from "./backups-setup-progress";

const DRAWN_FIELDS: readonly string[] = [
  ...FREQUENCY_FIELDS,
  ...CONTENT_FIELDS,
];

/**
 * The first setup of a server's backups, one question at a time: where they
 * go, what seals them, how often, and what they carry.
 *
 * The bucket is proven by a test write before the passphrase is asked, and
 * kept on this computer once the passphrase step is passed; the frequency and
 * the content are the module's own draft, applied to the server at the end.
 * The secret key and the passphrase live in this component until they are
 * sent, and nowhere else.
 */
export function BackupsSetup({
  serverId,
  manifest,
  contents,
  docker,
  nameOf,
  onRetryContents,
  onActivated,
}: {
  serverId: string;
  manifest: Manifest;
  contents: ContentsState;
  /** Docker runs here, and its volumes are not in any backup. */
  docker: boolean;
  nameOf: (moduleId: string) => string;
  onRetryContents: () => Promise<void>;
  /** The module applied: the page reads the server again, and runs a first backup when asked. */
  onActivated: (runFirst: boolean) => Promise<void>;
}) {
  const t = useTranslations();

  const connection = descriptorOf("backup");
  const held = useBackupConnection((store) => store.held);
  const identity = useBackupConnection((store) => store.identity);
  const probing = useBackupConnection((store) => store.probing);
  const saving = useBackupConnection((store) => store.saving);
  const refusal = useBackupConnection((store) => store.problem);
  const readConnection = useBackupConnection((store) => store.read);
  const probe = useBackupConnection((store) => store.probe);
  const save = useBackupConnection((store) => store.save);
  const dismiss = useBackupConnection((store) => store.dismiss);
  const services = useServices();

  const [step, setStep] = useState<BackupSetupStep>("bucket");
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<BackupProvider>("r2");
  const [storage, setStorage] = useState<BackupStorage>(() => storageOf(null));
  const [secret, setSecret] = useState("");
  const [renewing, setRenewing] = useState(false);
  const [phrase, setPhrase] = useState<PhraseDraft>(NO_PHRASE);
  const [attempted, setAttempted] = useState(false);
  const [runFirst, setRunFirst] = useState(true);

  useEffect(() => {
    readConnection();
  }, [readConnection]);

  const { config, apply, values, steps } = services;

  if (held.status !== "read" || config.status !== "ready" || !connection) {
    return config.status === "failed" ? (
      <ErrorNotice error={config.error} />
    ) : (
      <SkeletonRows framed rows={5} />
    );
  }

  const view = held.view;
  const usingHeld = view !== null && !editing;
  const bucket = usingHeld ? storageOf(view) : storage;
  const bucketProblems = storageProblems(provider, storage);
  const secretMissing = !(view || secret.trim());
  const adoptable =
    identity.status === "read" && identity.identity ? identity.identity : null;
  const asksPassphrase =
    renewing ||
    (view === null && identity.status !== "reading" && adoptable === null);
  const savesConnection = !usingHeld || renewing;
  const running = apply.status === "running";

  const problems: FieldProblem[] = attempted
    ? services.problems()
    : services.shown();
  const stray = strayProblems(t, problems, DRAWN_FIELDS, manifest);

  function problemOf(key: string): string | undefined {
    const found = problems.find((problem) => problem.field === key);

    return found ? problemText(t, found) : undefined;
  }

  function go(next: BackupSetupStep): void {
    dismiss();
    setAttempted(false);
    setStep(next);
  }

  function editBucket(next: boolean): void {
    setEditing(next);

    if (next && view) {
      setStorage(storageOf(view));
      setProvider(providerOf(view.endpoint));
    }
  }

  async function leaveBucket(): Promise<void> {
    if (usingHeld) {
      go("passphrase");

      return;
    }

    setAttempted(true);

    if (Object.keys(bucketProblems).length > 0 || secretMissing) {
      return;
    }

    const proven = await probe({
      ...storage,
      ...(secret.trim() ? { secret_access_key: secret } : {}),
    });

    if (proven) {
      go("passphrase");
    }
  }

  async function leavePassphrase(): Promise<void> {
    if (!savesConnection) {
      go("frequency");

      return;
    }

    setAttempted(true);

    if (asksPassphrase && !phraseReady(phrase)) {
      return;
    }

    const kept = await save({
      ...bucket,
      ...(secret.trim() ? { secret_access_key: secret } : {}),
      ...(asksPassphrase ? { passphrase: phrase.passphrase } : {}),
    });

    if (kept) {
      setSecret("");
      setPhrase(NO_PHRASE);
      setRenewing(false);
      setEditing(false);
      go("frequency");
    }
  }

  function leaveFrequency(): void {
    const frequency = fieldsOf("frequency");
    const refused = services
      .problems()
      .some((problem) => frequency.includes(problem.field));

    if (refused) {
      setAttempted(true);

      return;
    }

    go("content");
  }

  async function activate(): Promise<void> {
    await services.reconfigure(serverId, manifest.id);

    const after = useServices.getState();

    if (after.apply.status === "done") {
      await onActivated(runFirst);

      return;
    }

    const [first] = after.shown();

    if (first) {
      setStep(stepOfField(first.field));
    }
  }

  function next(): Promise<void> | void {
    switch (step) {
      case "bucket":
        return leaveBucket();
      case "passphrase":
        return leavePassphrase();
      case "frequency":
        return leaveFrequency();
      default:
        return activate();
    }
  }

  const here = BACKUP_SETUP_STEPS.indexOf(step);

  return (
    <Section name="backup-setup" title={t("backups.setup.title")}>
      <form
        className="contents"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        <Panel className="flex flex-col" inset="none">
          <BackupsSetupProgress current={step} onGo={go} />

          <div className="flex flex-col gap-6 p-6" data-setup={step}>
            {step === "bucket" ? (
              <BackupsSetupBucket
                connection={connection}
                editing={editing}
                held={view}
                onEditing={editBucket}
                onProvider={setProvider}
                onSecret={setSecret}
                onStorage={setStorage}
                problems={attempted ? bucketProblems : {}}
                provider={provider}
                secret={secret}
                secretProblem={
                  attempted && secretMissing
                    ? t("backups.field.problem.required")
                    : undefined
                }
                storage={storage}
              />
            ) : null}

            {step === "passphrase" ? (
              <BackupsSetupPassphrase
                asks={asksPassphrase}
                attempted={attempted}
                held={view}
                identity={identity}
                onPhrase={setPhrase}
                onRenew={setRenewing}
                phrase={phrase}
                renewing={renewing}
              />
            ) : null}

            {step === "frequency" ? (
              <BackupsFrequencyFields
                onValue={services.setValue}
                problemOf={problemOf}
                values={values}
              />
            ) : null}

            {step === "content" ? (
              <BackupsSetupContent
                contents={contents}
                docker={docker}
                manifest={manifest}
                onRetryContents={onRetryContents}
                onRunFirst={setRunFirst}
                problemOf={problemOf}
                runFirst={runFirst}
              />
            ) : null}

            {refusal ? <ErrorNotice bare error={refusal} /> : null}
          </div>

          <BackupsSetupFooter
            busy={running || saving || probing}
            last={step === "content"}
            onBack={
              here > 0
                ? () => go(BACKUP_SETUP_STEPS[here - 1] ?? "bucket")
                : undefined
            }
            stray={stray}
          />
        </Panel>
      </form>

      <ServiceConfigOutcome
        apply={apply}
        name={manifest.name}
        nameOf={nameOf}
        secretsDropped={services.secretsDropped}
        steps={steps}
      />
    </Section>
  );
}
