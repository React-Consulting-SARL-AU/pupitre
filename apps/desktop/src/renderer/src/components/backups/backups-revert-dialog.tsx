import { BackupConnectionTextField } from "@renderer/components/connections/backup-connection-text-field";
import { Button } from "@renderer/components/ui/button";
import { CheckLine } from "@renderer/components/ui/check-line";
import { Dialog } from "@renderer/components/ui/dialog";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { backupLabel } from "@renderer/lib/backups";
import type { AgentError } from "@shared/agent";
import type { PlatformBackup } from "@shared/backups";
import { History } from "lucide-react";
import { useState } from "react";

export function BackupsRevertDialog({
  backup,
  checking,
  refusal,
  onConfirm,
  onClose,
}: {
  backup: PlatformBackup | null;
  checking: boolean;
  refusal: AgentError | null;
  onConfirm: (passphrase: string, saveFirst: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations();

  const [passphrase, setPassphrase] = useState("");
  // Saving the machine first is what lets a revert be undone, hence on by default.
  const [saveFirst, setSaveFirst] = useState(true);

  function close(): void {
    setPassphrase("");
    setSaveFirst(true);
    onClose();
  }

  return (
    <Dialog
      actions={
        <>
          <Button onClick={close} variant="discreet">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={passphrase.trim() === ""}
            icon={History}
            loading={checking}
            onClick={() => onConfirm(passphrase, saveFirst)}
            variant="destructive"
          >
            {t("backups.revert.confirm")}
          </Button>
        </>
      }
      name="backup-revert"
      onClose={close}
      open={backup !== null}
      title={t("backups.revert.title", {
        backup: backup ? backupLabel(t, backup) : "",
      })}
      width="wide"
    >
      <p className="text-control text-ink-2 leading-relaxed">
        {t("backups.revert.consequence")}
      </p>

      <CheckLine
        checked={saveFirst}
        detail={t("backups.revert.saveFirstDetail")}
        label={t("backups.revert.saveFirst")}
        name="backup-save-first"
        onChange={setSaveFirst}
      />

      <BackupConnectionTextField
        help={t("backups.revert.passphraseHelp")}
        kind="prose"
        label={t("backups.passphrase.label")}
        name="backup-revert-passphrase"
        onChange={setPassphrase}
        secret
        value={passphrase}
      />

      {refusal ? <ErrorNotice bare error={refusal} /> : null}
    </Dialog>
  );
}
