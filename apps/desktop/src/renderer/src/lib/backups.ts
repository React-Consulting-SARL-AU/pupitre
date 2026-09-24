import type {
  BackupCounts,
  BackupDatabaseEngine,
  BackupPart,
} from "@pupitre/shared/backup";
import type { Translate } from "@renderer/i18n/i18n";

/**
 * A backup in words: what it holds, counted, and each part named the way a
 * reader would look for it — a database by its engine and name, a project by
 * its name. The platform never names them; a restored manifest does.
 */

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

/** The engines by the names their makers give them. */
export const ENGINE_NAMES: Record<BackupDatabaseEngine, string> = {
  mongodb: "MongoDB",
  mysql: "MySQL",
  postgres: "PostgreSQL",
  redis: "Redis",
};

/**
 * A database as the reader knows it: `PostgreSQL · shop`. The `*` of a whole
 * engine names what it is — the roles, the accounts, the snapshot.
 */
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

/**
 * The public key backups are sealed to, short enough to compare aloud: the
 * first sixteen hex digits of the SHA-256 of its base64 text, in four groups.
 */
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

/** An exclusion list with one item carried again, or left out. */
export function excluding(
  excluded: readonly string[],
  item: string,
  carried: boolean
): string[] {
  const others = excluded.filter((one) => one !== item);

  return carried ? others : [...others, item];
}

/** The draft's list of text, or none when the value is not one. */
export function listOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((one): one is string => typeof one === "string")
    : [];
}
