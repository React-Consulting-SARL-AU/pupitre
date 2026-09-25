import { Details } from "@renderer/components/ui/details";
import { SwitchLine } from "@renderer/components/ui/switch";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { BackupProvider } from "@renderer/lib/backup-providers";
import type { BackupStorage } from "@shared/backups";
import { useState } from "react";
import { BackupConnectionTextField } from "./backup-connection-text-field";

type Advanced = Pick<BackupStorage, "region" | "prefix" | "path_style">;

/**
 * What a bucket rarely needs changed, folded away and opened on its own when
 * one of them is refused: the prefix, and for a service Pupitre does not know,
 * the region and the addressing.
 */
export function BackupConnectionAdvanced({
  provider,
  values,
  problems,
  onChange,
}: {
  provider: BackupProvider;
  values: Advanced;
  problems: { region?: string; prefix?: string };
  onChange: <K extends keyof BackupStorage>(
    key: K,
    value: BackupStorage[K]
  ) => void;
}) {
  const t = useTranslations();

  const [opened, setOpened] = useState(false);
  const refused = Boolean(problems.region || problems.prefix);
  const other = provider === "other";

  return (
    <Details
      label={t("backups.advanced")}
      name="backup-advanced"
      onOpenChange={setOpened}
      open={opened || refused}
    >
      <div className="flex flex-col gap-6 pt-3 text-control">
        <div className="grid gap-6 sm:grid-cols-2">
          {other ? (
            <BackupConnectionTextField
              label={t("backups.field.region")}
              name="backup-region"
              onChange={(value) => onChange("region", value)}
              problem={problems.region}
              value={values.region}
            />
          ) : null}
          <BackupConnectionTextField
            help={t("backups.field.prefixHelp")}
            label={t("backups.field.prefix")}
            name="backup-prefix"
            onChange={(value) => onChange("prefix", value)}
            problem={problems.prefix}
            value={values.prefix}
          />
        </div>

        {other ? (
          <SwitchLine
            checked={values.path_style}
            detail={t("backups.field.pathStyleDetail")}
            label={t("backups.field.pathStyle")}
            name="backup-path-style"
            onChange={(next) => onChange("path_style", next)}
          />
        ) : null}
      </div>
    </Details>
  );
}
