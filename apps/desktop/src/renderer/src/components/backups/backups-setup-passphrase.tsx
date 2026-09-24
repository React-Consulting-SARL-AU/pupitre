import { BackupIdentityChoice } from "@renderer/components/connections/backup-identity-choice";
import { BackupPassphraseFields } from "@renderer/components/connections/backup-passphrase-fields";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { PhraseDraft } from "@renderer/lib/backup-passphrase";
import { useFingerprint } from "@renderer/lib/use-fingerprint";
import type { IdentityState } from "@renderer/stores/backup-connection";
import type { BackupConnectionView } from "@shared/backups";

/**
 * The second step: the key backups are sealed to. The one this computer
 * holds, or the organization's, is kept unless the reader asks for a new
 * passphrase; a first computer chooses one, typed twice or drawn.
 */
export function BackupsSetupPassphrase({
  held,
  identity,
  asks,
  renewing,
  phrase,
  attempted,
  onRenew,
  onPhrase,
}: {
  held: BackupConnectionView | null;
  identity: IdentityState;
  asks: boolean;
  renewing: boolean;
  phrase: PhraseDraft;
  attempted: boolean;
  onRenew: (next: boolean) => void;
  onPhrase: (next: PhraseDraft) => void;
}) {
  const t = useTranslations();

  const fingerprint = useFingerprint(held?.recipient ?? null);

  return (
    <div className="flex flex-col gap-6" data-setup-passphrase="">
      {held ? (
        <p className="text-ink-2">
          {t("backups.setup.passphrase.held", { fingerprint })}
        </p>
      ) : null}

      <BackupIdentityChoice
        held={held !== null}
        identity={identity}
        onRenew={onRenew}
        renewing={renewing}
      />

      {asks ? (
        <BackupPassphraseFields
          attempted={attempted}
          onChange={onPhrase}
          phrase={phrase}
          shown={attempted || phrase.confirm !== ""}
        />
      ) : null}
    </div>
  );
}
