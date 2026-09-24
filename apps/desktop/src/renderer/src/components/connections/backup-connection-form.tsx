import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
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
import { useBackupConnection } from "@renderer/stores/backup-connection";
import type { BackupConnectionView, BackupStorage } from "@shared/backups";
import { Save, Undo2 } from "lucide-react";
import { useState } from "react";
import { BackupGuideLink } from "./backup-guide-link";
import { BackupIdentityChoice } from "./backup-identity-choice";
import { BackupPassphraseFields } from "./backup-passphrase-fields";
import { BackupStorageFields } from "./backup-storage-fields";
import type { ConnectionDescriptor } from "./connection-descriptors";

/**
 * The bucket, the access key, and the passphrase backups are sealed with.
 *
 * A first computer of the organization chooses the passphrase; the next ones
 * take the organization's public key and are asked for nothing but the bucket.
 * A connection already held keeps its secret key and its passphrase unless the
 * reader types new ones. The main process writes then deletes an object in the
 * bucket before keeping anything, and its refusal is said here.
 */
export function BackupConnectionForm({
  connection,
  initial,
  start,
  saveLabel,
  onSaved,
  onCancel,
}: {
  connection: ConnectionDescriptor;
  initial: BackupConnectionView | null;
  /** The bucket to start from when this computer holds none: the one a server already backs up to. */
  start?: BackupStorage;
  /** What saving does beyond keeping the connection, when it does more. */
  saveLabel?: string;
  onSaved?: () => Promise<void> | void;
  onCancel?: () => void;
}) {
  const t = useTranslations();

  const identity = useBackupConnection((store) => store.identity);
  const saving = useBackupConnection((store) => store.saving);
  const problem = useBackupConnection((store) => store.problem);
  const save = useBackupConnection((store) => store.save);

  const [storage, setStorage] = useState<BackupStorage>(
    () => start ?? storageOf(initial)
  );
  const [provider, setProvider] = useState<BackupProvider>(() =>
    providerOf(initial?.endpoint ?? start?.endpoint ?? "")
  );
  const [secret, setSecret] = useState("");
  const [renewing, setRenewing] = useState(false);
  const [phrase, setPhrase] = useState<PhraseDraft>(NO_PHRASE);
  const [attempted, setAttempted] = useState(false);

  const adoptable =
    identity.status === "read" && identity.identity ? identity.identity : null;
  const asksPassphrase =
    renewing ||
    (!initial && identity.status !== "reading" && adoptable === null);
  const problems = storageProblems(provider, storage);
  const secretMissing = !(initial || secret.trim());
  const dirty =
    JSON.stringify(storage) !== JSON.stringify(storageOf(initial)) ||
    secret.trim() !== "" ||
    renewing;

  async function submit(): Promise<void> {
    setAttempted(true);

    if (
      Object.keys(problems).length > 0 ||
      secretMissing ||
      (asksPassphrase && !phraseReady(phrase))
    ) {
      return;
    }

    const kept = await save({
      ...storage,
      ...(secret.trim() ? { secret_access_key: secret } : {}),
      ...(asksPassphrase ? { passphrase: phrase.passphrase } : {}),
    });

    if (kept) {
      setSecret("");
      setPhrase(NO_PHRASE);
      setRenewing(false);
      setAttempted(false);
      await onSaved?.();
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      data-backup-form={initial ? "edit" : "new"}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <BackupGuideLink />

      <BackupStorageFields
        connection={connection}
        onProvider={setProvider}
        onSecret={setSecret}
        onStorage={setStorage}
        problems={attempted ? problems : {}}
        provider={provider}
        secret={secret}
        secretHelp={t(initial ? "backups.field.secretKept" : connection.help)}
        secretProblem={
          attempted && secretMissing
            ? t("backups.field.problem.required")
            : undefined
        }
        storage={storage}
      />

      <BackupIdentityChoice
        held={initial !== null}
        identity={identity}
        onRenew={setRenewing}
        renewing={renewing}
      />

      {asksPassphrase ? (
        <BackupPassphraseFields
          attempted={attempted}
          onChange={setPhrase}
          phrase={phrase}
          shown={attempted || phrase.confirm !== ""}
        />
      ) : null}

      {problem ? <ErrorNotice bare error={problem} /> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel ? (
          <Button icon={Undo2} onClick={onCancel} size="sm" variant="discreet">
            {t("backups.connection.cancel")}
          </Button>
        ) : null}
        <Button
          disabled={!dirty || saving}
          icon={Save}
          loading={saving}
          size="sm"
          submit
          variant="inverse"
        >
          {saveLabel ?? t("backups.connection.save")}
        </Button>
      </div>
    </form>
  );
}
