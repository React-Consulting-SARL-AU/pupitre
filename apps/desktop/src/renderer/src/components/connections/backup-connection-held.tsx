import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useFingerprint } from "@renderer/lib/use-fingerprint";
import type { BackupConnectionView } from "@shared/backups";
import { Pencil, Unplug } from "lucide-react";

export function BackupConnectionHeld({
  view,
  unsealed,
  onEdit,
  onForget,
}: {
  view: BackupConnectionView;
  /** The keychain refused the secret key: it is held for this run only. */
  unsealed: boolean;
  onEdit: () => void;
  onForget: () => Promise<void>;
}) {
  const t = useTranslations();

  const fingerprint = useFingerprint(view.recipient);

  return (
    <div
      className="flex flex-col gap-4"
      data-connected="true"
      data-connection="backup"
    >
      <FactList columns={2}>
        <Fact label={t("backups.field.bucket")}>{view.bucket}</Fact>
        <Fact label={t("backups.field.endpoint")}>{view.endpoint}</Fact>
        <Fact label={t("backups.field.prefix")}>{view.prefix}</Fact>
        <Fact
          detail={t("backups.connection.fingerprintDetail")}
          label={t("backups.connection.fingerprint")}
        >
          {fingerprint}
        </Fact>
      </FactList>

      {unsealed ? (
        <p className="text-small text-warn">{t("connections.unsealed")}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Pencil} onClick={onEdit} size="sm">
          {t("backups.connection.edit")}
        </Button>
        <ConfirmButton
          confirmLabel={t("connections.forgetConfirm")}
          icon={Unplug}
          onConfirm={onForget}
          question={t("backups.connection.forgetQuestion")}
          size="sm"
        >
          {t("connections.forget")}
        </ConfirmButton>
      </div>
    </div>
  );
}
