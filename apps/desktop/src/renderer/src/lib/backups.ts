import type {
  BackupCounts,
  BackupDatabaseEngine,
  BackupPart,
} from "@pupitre/shared/backup";
import type { Translate } from "@renderer/i18n/i18n";
import { dated } from "./format";

export function backupLabel(
  t: Translate,
  backup: { created_at: string; name?: string }
): string {
  const date = dated(backup.created_at);

  return backup.name
    ? t("backups.label.named", { date, name: backup.name })
    : t("backups.label.dated", { date });
}

export function countsLabel(t: Translate, counts: BackupCounts): string {
  const said = [
    counts.databases > 0
      ? t.plural("backups.counts.databases", counts.databases)
      : "",
    counts.projects > 0
      ? t.plural("backups.counts.projects", counts.projects)
      : "",
    counts.paths > 0 ? t.plural("backups.counts.paths", counts.paths) : "",
    counts.home ? t("backups.counts.home") : "",
  ].filter(Boolean);

  return said.length > 0 ? said.join(" · ") : t("backups.counts.setupOnly");
}

export const ENGINE_NAMES: Record<BackupDatabaseEngine, string> = {
  mongodb: "MongoDB",
  mysql: "MySQL",
  postgres: "PostgreSQL",
  redis: "Redis",
};

/** A `*` name stands for the whole engine: its roles, accounts or snapshot. */
export function databaseLabel(
  t: Translate,
  engine: BackupDatabaseEngine,
  name: string
): string {
  const named = name === "*" ? t(`backups.database.whole.${engine}`) : name;

  return `${ENGINE_NAMES[engine]} · ${named}`;
}

export function partLabel(t: Translate, part: BackupPart): string {
  switch (part.kind) {
    case "database":
      return t("backups.part.database", {
        database: databaseLabel(t, part.engine, part.name),
      });
    case "project":
      return t("backups.part.project", { name: part.name });
    case "path":
      return t("backups.part.path", { path: part.path });
    case "home":
      return t("backups.part.home");
    default:
      return t("backups.part.setup");
  }
}

const FINGERPRINT_HEX = 16;

const FINGERPRINT_GROUP = /.{4}/g;

export async function recipientFingerprint(recipient: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(recipient)
  );

  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, FINGERPRINT_HEX);

  return hex.match(FINGERPRINT_GROUP)?.join(" ") ?? hex;
}

export function excluding(
  excluded: readonly string[],
  item: string,
  carried: boolean
): string[] {
  const others = excluded.filter((one) => one !== item);

  return carried ? others : [...others, item];
}

export function listOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((one): one is string => typeof one === "string")
    : [];
}
