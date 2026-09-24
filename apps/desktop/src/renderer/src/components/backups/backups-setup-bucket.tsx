import { BackupGuideLink } from "@renderer/components/connections/backup-guide-link";
import { BackupStorageFields } from "@renderer/components/connections/backup-storage-fields";
import type { ConnectionDescriptor } from "@renderer/components/connections/connection-descriptors";
import { Button } from "@renderer/components/ui/button";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { useTranslations } from "@renderer/i18n/use-translations";
import type {
  BackupProvider,
  StorageProblem,
} from "@renderer/lib/backup-providers";
import type { BackupConnectionView, BackupStorage } from "@shared/backups";
import { ArrowLeftRight, Undo2 } from "lucide-react";

/**
 * The first step: the bucket this computer already holds, kept in one click,
 * or the one the reader gives — the provider, what it cannot derive, the key.
 */
export function BackupsSetupBucket({
  connection,
  held,
  editing,
  provider,
  storage,
  secret,
  problems,
  secretProblem,
  onEditing,
  onProvider,
  onStorage,
  onSecret,
}: {
  connection: ConnectionDescriptor;
  held: BackupConnectionView | null;
  editing: boolean;
  provider: BackupProvider;
  storage: BackupStorage;
  secret: string;
  problems: Partial<Record<keyof BackupStorage, StorageProblem>>;
  secretProblem?: string;
  onEditing: (next: boolean) => void;
  onProvider: (next: BackupProvider) => void;
  onStorage: (next: BackupStorage) => void;
  onSecret: (next: string) => void;
}) {
  const t = useTranslations();

  if (held && !editing) {
    return (
      <div className="flex flex-col gap-5" data-setup-bucket="held">
        <p className="text-ink-2">{t("backups.setup.bucket.held")}</p>

        <FactList columns={3}>
          <Fact label={t("backups.field.bucket")}>{held.bucket}</Fact>
          <Fact label={t("backups.field.endpoint")}>{held.endpoint}</Fact>
          <Fact label={t("backups.field.prefix")}>{held.prefix}</Fact>
        </FactList>

        <div>
          <Button
            icon={ArrowLeftRight}
            onClick={() => onEditing(true)}
            size="sm"
          >
            {t("backups.setup.bucket.other")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-setup-bucket="form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-2">{t("backups.setup.bucket.lead")}</p>
        <BackupGuideLink />
      </div>

      <BackupStorageFields
        connection={connection}
        onProvider={onProvider}
        onSecret={onSecret}
        onStorage={onStorage}
        problems={problems}
        provider={provider}
        secret={secret}
        secretHelp={t(held ? "backups.field.secretKept" : connection.help)}
        secretProblem={secretProblem}
        storage={storage}
      />

      {held ? (
        <div>
          <Button
            icon={Undo2}
            onClick={() => onEditing(false)}
            size="sm"
            variant="discreet"
          >
            {t("backups.setup.bucket.keep")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
