import { Button } from "@renderer/components/ui/button";
import { CheckLine } from "@renderer/components/ui/check-line";
import { CopyField } from "@renderer/components/ui/copy-field";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  drawPassphrase,
  type PhraseDraft,
  passphraseProblem,
} from "@renderer/lib/backup-passphrase";
import { BACKUP_PASSPHRASE_MIN } from "@shared/backups";
import { Dices } from "lucide-react";
import { BackupConnectionTextField } from "./backup-connection-text-field";

/**
 * The passphrase, typed twice or drawn, and said to be the only key there is.
 *
 * It stays in the form until it is sent: the main process derives it and keeps
 * the public key alone. A drawn one is shown once, fills both fields, and is
 * saved only once the reader says it is written down somewhere else — a drawn
 * phrase is one nobody remembers.
 */
export function BackupPassphraseFields({
  phrase,
  shown,
  attempted,
  onChange,
}: {
  phrase: PhraseDraft;
  /** Whether a refusal may be said yet: once typed in, or once sent. */
  shown: boolean;
  /** The form was sent: what is still owed is said. */
  attempted: boolean;
  onChange: (next: PhraseDraft) => void;
}) {
  const t = useTranslations();

  const { passphrase, confirm, drawn, noted } = phrase;
  const problem = shown ? passphraseProblem(passphrase, confirm) : null;

  function typed(next: Pick<PhraseDraft, "passphrase" | "confirm">): void {
    onChange({ ...next, drawn: null, noted: false });
  }

  function draw(): void {
    const next = drawPassphrase();

    onChange({ confirm: next, drawn: next, noted: false, passphrase: next });
  }

  return (
    <div className="flex flex-col gap-6" data-backup-passphrase="">
      <p className="text-[12px] text-warn leading-relaxed">
        {t("backups.passphrase.lost")}
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <BackupConnectionTextField
          help={t("backups.passphrase.help", { min: BACKUP_PASSPHRASE_MIN })}
          kind="prose"
          label={t("backups.passphrase.label")}
          name="backup-passphrase"
          onChange={(value) => typed({ confirm, passphrase: value })}
          problem={
            problem === "short"
              ? t("backups.passphrase.short", { min: BACKUP_PASSPHRASE_MIN })
              : undefined
          }
          secret
          value={passphrase}
        />
        <BackupConnectionTextField
          kind="prose"
          label={t("backups.passphrase.confirm")}
          name="backup-passphrase-confirm"
          onChange={(value) => typed({ confirm: value, passphrase })}
          problem={
            problem === "mismatch"
              ? t("backups.passphrase.mismatch")
              : undefined
          }
          secret
          value={confirm}
        />
      </div>

      <div>
        <Button icon={Dices} onClick={draw} size="sm">
          {t("backups.passphrase.draw")}
        </Button>
      </div>

      {drawn ? (
        <div className="flex flex-col gap-3">
          <CopyField
            help={t("backups.passphrase.drawnHelp")}
            label={t("backups.passphrase.drawn")}
            value={drawn}
          />
          <CheckLine
            checked={noted}
            label={t("backups.passphrase.noted")}
            name="backup-passphrase-noted"
            onChange={(next) => onChange({ ...phrase, noted: next })}
          />
          {attempted && !noted ? (
            <span className="text-[12px] text-danger">
              {t("backups.passphrase.notedMissing")}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
