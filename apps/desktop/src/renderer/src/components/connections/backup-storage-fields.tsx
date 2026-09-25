import { ModeCard, ModeCards } from "@renderer/components/ui/mode-card";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  awsEndpoint,
  type BackupProvider,
  r2AccountOf,
  r2Endpoint,
  type StorageProblem,
  switchedTo,
} from "@renderer/lib/backup-providers";
import type { BackupStorage } from "@shared/backups";
import { Cloud, CloudCog, Server } from "lucide-react";
import { BackupConnectionAdvanced } from "./backup-connection-advanced";
import { BackupConnectionTextField } from "./backup-connection-text-field";
import type { ConnectionDescriptor } from "./connection-descriptors";

const PROVIDER_ICONS = { aws: CloudCog, other: Server, r2: Cloud } as const;

export function BackupStorageFields({
  connection,
  provider,
  storage,
  secret,
  secretHelp,
  problems,
  secretProblem,
  onProvider,
  onStorage,
  onSecret,
}: {
  connection: ConnectionDescriptor;
  provider: BackupProvider;
  storage: BackupStorage;
  secret: string;
  secretHelp: string;
  problems: Partial<Record<keyof BackupStorage, StorageProblem>>;
  secretProblem?: string;
  onProvider: (next: BackupProvider) => void;
  onStorage: (next: BackupStorage) => void;
  onSecret: (next: string) => void;
}) {
  const t = useTranslations();

  function set<K extends keyof BackupStorage>(
    key: K,
    value: BackupStorage[K]
  ): void {
    onStorage({ ...storage, [key]: value });
  }

  function said(key: keyof BackupStorage): string | undefined {
    const found = problems[key];

    return found ? t(`backups.field.problem.${found}`) : undefined;
  }

  const awsRegion = said("region") ?? said("endpoint");

  return (
    <div className="flex flex-col gap-6" data-backup-storage={provider}>
      <ModeCards
        label={t("backups.provider.label")}
        onChange={(next: BackupProvider) => {
          onProvider(next);
          onStorage(switchedTo(next, storage));
        }}
        value={provider}
      >
        {(["r2", "aws", "other"] as const).map((one) => (
          <ModeCard
            detail={t(`backups.provider.${one}.detail`)}
            icon={PROVIDER_ICONS[one]}
            key={one}
            title={t(`backups.provider.${one}.title`)}
            value={one}
          />
        ))}
      </ModeCards>

      <div className="grid gap-6 sm:grid-cols-2">
        {provider === "r2" ? (
          <BackupConnectionTextField
            help={t("backups.field.r2AccountHelp")}
            label={t("backups.field.r2Account")}
            name="backup-r2-account"
            onChange={(value) => set("endpoint", r2Endpoint(value))}
            problem={said("endpoint")}
            value={r2AccountOf(storage.endpoint)}
          />
        ) : null}

        {provider === "aws" ? (
          <BackupConnectionTextField
            help={t("backups.field.awsRegionHelp")}
            label={t("backups.field.region")}
            name="backup-aws-region"
            onChange={(value) =>
              onStorage({
                ...storage,
                endpoint: awsEndpoint(value),
                region: value.trim(),
              })
            }
            problem={awsRegion}
            value={storage.region}
          />
        ) : null}

        {provider === "other" ? (
          <BackupConnectionTextField
            help={t("backups.field.endpointHelp")}
            label={t("backups.field.endpoint")}
            name="backup-endpoint"
            onChange={(value) => set("endpoint", value)}
            problem={said("endpoint")}
            value={storage.endpoint}
          />
        ) : null}

        <BackupConnectionTextField
          label={t("backups.field.bucket")}
          name="backup-bucket"
          onChange={(value) => set("bucket", value)}
          problem={said("bucket")}
          value={storage.bucket}
        />
        <BackupConnectionTextField
          label={t("backups.field.accessKeyId")}
          name="backup-access-key-id"
          onChange={(value) => set("access_key_id", value)}
          problem={said("access_key_id")}
          value={storage.access_key_id}
        />
        <BackupConnectionTextField
          help={secretHelp}
          hint={{ text: t(connection.hint), url: connection.url }}
          label={t(connection.label)}
          name="backup-secret-access-key"
          onChange={onSecret}
          problem={secretProblem}
          secret
          value={secret}
        />
      </div>

      <BackupConnectionAdvanced
        onChange={set}
        problems={{
          prefix: said("prefix"),
          region: provider === "other" ? said("region") : undefined,
        }}
        provider={provider}
        values={storage}
      />
    </div>
  );
}
