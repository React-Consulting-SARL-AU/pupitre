import type { BackupContentsResult } from "@pupitre/shared/agent-protocol/backup";
import {
  BACKUP_DATABASE_ENGINES,
  type BackupDatabaseEngine,
} from "@pupitre/shared/backup";
import { Callout } from "@renderer/components/ui/callout";
import { CheckLine } from "@renderer/components/ui/check-line";
import { SwitchLine } from "@renderer/components/ui/switch";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import { databaseLabel, ENGINE_NAMES, excluding } from "@renderer/lib/backups";

/** An exclusion that names a database no longer listed: named as well as its item allows. */
function goneLabel(t: Translate, item: string): string {
  const [engine, ...rest] = item.split(":");

  return (BACKUP_DATABASE_ENGINES as readonly string[]).includes(engine ?? "")
    ? databaseLabel(t, engine as BackupDatabaseEngine, rest.join(":"))
    : item;
}

/**
 * The databases a backup carries: the whole category, then each database the
 * server holds, ticked unless the settings leave it out. An exclusion naming a
 * database that is gone stays, unticked, so it holds if the database returns.
 */
export function BackupsContentDatabases({
  label,
  carried,
  databases,
  unreadable,
  excluded,
  problem,
  onCarried,
  onExcluded,
}: {
  label: string;
  carried: boolean;
  /** Null until the server has said what it holds. */
  databases: BackupContentsResult["databases"] | null;
  unreadable: BackupContentsResult["unreadable"];
  excluded: readonly string[];
  problem?: string;
  onCarried: (next: boolean) => void;
  onExcluded: (next: string[]) => void;
}) {
  const t = useTranslations();

  const listed = new Set((databases ?? []).map((one) => one.item));
  const gone = excluded.filter((item) => !listed.has(item));

  return (
    <div className="flex flex-col gap-3" data-backup-content="databases">
      <SwitchLine
        checked={carried}
        detail={t("backups.contents.databasesDetail")}
        label={label}
        name="backup-databases"
        onChange={onCarried}
      />

      <div className="flex flex-col gap-2 border-line border-l pl-4">
        {(databases ?? []).map((database) => (
          <CheckLine
            checked={!excluded.includes(database.item)}
            disabled={!carried}
            key={database.item}
            label={databaseLabel(t, database.engine, database.name)}
            name={`backup-database-${database.item}`}
            onChange={(next) =>
              onExcluded(excluding(excluded, database.item, next))
            }
          />
        ))}

        {gone.map((item) => (
          <CheckLine
            checked={false}
            detail={t("backups.contents.gone")}
            disabled={!carried}
            key={item}
            label={goneLabel(t, item)}
            name={`backup-database-${item}`}
            onChange={(next) => onExcluded(excluding(excluded, item, next))}
          />
        ))}

        {problem ? (
          <span className="text-[12px] text-danger">{problem}</span>
        ) : null}
      </div>

      {unreadable.length > 0 ? (
        <Callout name="backup-unreadable" tone="warn">
          {t("backups.contents.unreadable", {
            engines: unreadable
              .map((engine) => ENGINE_NAMES[engine])
              .join(", "),
          })}
        </Callout>
      ) : null}
    </div>
  );
}
