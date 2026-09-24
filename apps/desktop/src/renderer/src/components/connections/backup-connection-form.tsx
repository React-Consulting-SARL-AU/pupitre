import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { passphraseProblem } from "@renderer/lib/backup-passphrase";
import { useBackupConnection } from "@renderer/stores/backup-connection";
import {
  type BackupConnectionView,
  type BackupStorage,
  backupStorageProblems,
} from "@shared/backups";
import { ExternalLink, Save, Undo2 } from "lucide-react";
import { useState } from "react";
import { BackupConnectionAdvanced } from "./backup-connection-advanced";
import { BackupConnectionTextField } from "./backup-connection-text-field";
import { BackupIdentityChoice } from "./backup-identity-choice";
import { BackupPassphraseFields } from "./backup-passphrase-fields";
import type { ConnectionDescriptor } from "./connection-descriptors";

const BLANK: BackupStorage = {
  access_key_id: "",
  bucket: "",
  endpoint: "",
  path_style: true,
  prefix: "pupitre",
  region: "auto",
};

function storageOf(view: BackupConnectionView | null): BackupStorage {
  return view
    ? {
        access_key_id: view.access_key_id,
        bucket: view.bucket,
        endpoint: view.endpoint,
        path_style: view.path_style,
        prefix: view.prefix,
        region: view.region,
      }
    : BLANK;
}

interface Phrase {
  passphrase: string;
  confirm: string;
  /** The phrase the app drew, while it is the one in the fields. */
  drawn: string | null;
  noted: boolean;
}

const NO_PHRASE: Phrase = {
  confirm: "",
  drawn: null,
  noted: false,
  passphrase: "",
};

/** Whether the phrase, when one is asked, can be sent: well formed, and noted when drawn. */
function phraseReady(phrase: Phrase): boolean {
  return (
    passphraseProblem(phrase.passphrase, phrase.confirm) === null &&
    (phrase.drawn === null || phrase.noted)
  );
}

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
  onSaved,
  onCancel,
}: {
  connection: ConnectionDescriptor;
  initial: BackupConnectionView | null;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();

  const identity = useBackupConnection((store) => store.identity);
  const saving = useBackupConnection((store) => store.saving);
  const problem = useBackupConnection((store) => store.problem);
  const save = useBackupConnection((store) => store.save);

  const [storage, setStorage] = useState<BackupStorage>(() =>
    storageOf(initial)
  );
  const [secret, setSecret] = useState("");
  const [renewing, setRenewing] = useState(false);
  const [phrase, setPhrase] = useState<Phrase>(NO_PHRASE);
  const [attempted, setAttempted] = useState(false);

  const adoptable =
    identity.status === "read" && identity.identity ? identity.identity : null;
  const asksPassphrase =
    renewing ||
    (!initial && identity.status !== "reading" && adoptable === null);
  const problems = attempted ? backupStorageProblems(storage) : {};
  const secretMissing = !(initial || secret.trim());
  const dirty =
    JSON.stringify(storage) !== JSON.stringify(storageOf(initial)) ||
    secret.trim() !== "" ||
    renewing;

  function set<K extends keyof BackupStorage>(
    key: K,
    value: BackupStorage[K]
  ): void {
    setStorage((held) => ({ ...held, [key]: value }));
  }

  function problemOf(key: keyof BackupStorage): string | undefined {
    const found = problems[key];

    return found ? t(`backups.field.problem.${found}`) : undefined;
  }

  async function submit(): Promise<void> {
    setAttempted(true);

    if (
      Object.keys(backupStorageProblems(storage)).length > 0 ||
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
      onSaved?.();
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
      <div>
        <a
          className="clickable inline-flex items-center gap-1.5 text-[12px] text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
          href={t("backups.guideUrl")}
          onClick={(event) => {
            event.preventDefault();
            window.pupitre.openUrl(t("backups.guideUrl"));
          }}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink aria-hidden="true" size={12} strokeWidth={1.5} />
          {t("backups.guide")}
        </a>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <BackupConnectionTextField
          help={t("backups.field.endpointHelp")}
          label={t("backups.field.endpoint")}
          name="backup-endpoint"
          onChange={(value) => set("endpoint", value)}
          problem={problemOf("endpoint")}
          value={storage.endpoint}
        />
        <BackupConnectionTextField
          label={t("backups.field.bucket")}
          name="backup-bucket"
          onChange={(value) => set("bucket", value)}
          problem={problemOf("bucket")}
          value={storage.bucket}
        />
        <BackupConnectionTextField
          label={t("backups.field.accessKeyId")}
          name="backup-access-key-id"
          onChange={(value) => set("access_key_id", value)}
          problem={problemOf("access_key_id")}
          value={storage.access_key_id}
        />
        <BackupConnectionTextField
          help={t(initial ? "backups.field.secretKept" : connection.help)}
          hint={{ text: t(connection.hint), url: connection.url }}
          label={t(connection.label)}
          name="backup-secret-access-key"
          onChange={setSecret}
          problem={
            attempted && secretMissing
              ? t("backups.field.problem.required")
              : undefined
          }
          secret
          value={secret}
        />
      </div>

      <BackupConnectionAdvanced
        onChange={set}
        problems={{ prefix: problemOf("prefix"), region: problemOf("region") }}
        values={storage}
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
          confirm={phrase.confirm}
          drawn={phrase.drawn}
          noted={phrase.noted}
          onChange={(passphrase, confirm, drawn) =>
            setPhrase({ confirm, drawn, noted: false, passphrase })
          }
          onNoted={(noted) => setPhrase((held) => ({ ...held, noted }))}
          passphrase={phrase.passphrase}
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
          {t("backups.connection.save")}
        </Button>
      </div>
    </form>
  );
}
