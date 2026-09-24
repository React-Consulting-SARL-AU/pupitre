import { BACKUP_NAME_MAX, BackupNameSchema } from "@pupitre/shared/backup";
import { Button } from "@renderer/components/ui/button";
import { Dialog } from "@renderer/components/ui/dialog";
import { controlClass, Field, fieldAria } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import { HardDriveUpload } from "lucide-react";
import { useRef, useState } from "react";

/**
 * A backup now, and the name it goes by if the reader gives one. Left empty,
 * the backup is known by its date, as a scheduled one is.
 */
export function BackupsNameDialog({
  open,
  onConfirm,
  onClose,
}: {
  open: boolean;
  onConfirm: (name: string | undefined) => void;
  onClose: () => void;
}) {
  const t = useTranslations();

  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");

  const typed = name.trim();
  const refused = typed !== "" && !BackupNameSchema.safeParse(typed).success;

  function close(): void {
    setName("");
    onClose();
  }

  function confirm(): void {
    if (refused) {
      return;
    }

    setName("");
    onConfirm(typed === "" ? undefined : typed);
  }

  return (
    <Dialog
      actions={
        <>
          <Button onClick={close} variant="discreet">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={refused}
            icon={HardDriveUpload}
            onClick={confirm}
            variant="inverse"
          >
            {t("backups.name.confirm")}
          </Button>
        </>
      }
      focus={input}
      name="backup-name"
      onClose={close}
      open={open}
      title={t("backups.name.title")}
    >
      <Field
        help={t("backups.name.help")}
        label={t("backups.name.label")}
        name="backup-name"
        problem={
          refused
            ? t("backups.name.problem", { max: BACKUP_NAME_MAX })
            : undefined
        }
      >
        <input
          autoComplete="off"
          className={controlClass("prose", refused)}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirm();
            }
          }}
          placeholder={t("backups.name.placeholder")}
          ref={input}
          type="text"
          value={name}
          {...fieldAria({ help: true, name: "backup-name", problem: refused })}
        />
      </Field>
    </Dialog>
  );
}
