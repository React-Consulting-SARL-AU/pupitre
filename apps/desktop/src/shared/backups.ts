import type { BackupRestoreSetupResult } from "@pupitre/shared/agent-protocol/backup";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import {
  BACKUP_BUCKET_PATTERN,
  BACKUP_ENDPOINT_PATTERN,
  BACKUP_REGION_PATTERN,
  type BackupPart,
  type PlatformBackup as SharedPlatformBackup,
} from "@pupitre/shared/backup";

/**
 * What the two processes say to each other about backups.
 *
 * The bucket and its access key id are not secrets and cross the bridge; the
 * secret access key stays in the keychain, and the passphrase crosses once, on
 * its way to be derived, and is kept nowhere. What the connection holds of the
 * encryption is the public key and its salt: enough for a server to encrypt,
 * never to decrypt.
 */

/** The bucket, as `core.backup` names its managed fields. */
export interface BackupStorage {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  path_style: boolean;
  access_key_id: string;
}

/** The public half of the passphrase, and the salt it was derived with. */
export interface BackupIdentity {
  recipient: string;
  kdf_salt: string;
}

export type BackupConnectionView = BackupStorage & BackupIdentity;

/**
 * What the form sends. A secret key left out keeps the one the keychain holds;
 * a passphrase left out keeps the identity the connection holds, or adopts the
 * organization's when it holds none.
 */
export interface BackupConnectionInput extends BackupStorage {
  secret_access_key?: string;
  passphrase?: string;
}

/** The identity of the organization's most recent backup, which a second computer adopts. */
export interface OrganizationIdentity extends BackupIdentity {
  created_at: string;
  server_name: string;
}

export type PlatformBackup = SharedPlatformBackup;

/** The phases of a restore the main process relays while the passphrase is already verified. */
export type RestorePhase = "save" | "setup";

export type RestoreUpdate =
  | { kind: "phase"; phase: RestorePhase }
  | { kind: "event"; event: Event };

export interface RestoreSetupOptions {
  revert: boolean;
  /** A backup of the machine as it stands, before a revert replaces it. */
  saveFirst: boolean;
}

/** Short enough to type, long enough that the salt is not all that stands between the bucket and a guess. */
export const BACKUP_PASSPHRASE_MIN = 12;

/** Why a field of the bucket is refused: each has its own sentence under the field. */
export type BackupFieldProblem =
  | "required"
  | "http"
  | "endpoint"
  | "bucket"
  | "region"
  | "prefix";

/** The pattern `core.backup`'s manifest gives its `prefix`. */
const PREFIX_PATTERN = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

const ENDPOINT = new RegExp(BACKUP_ENDPOINT_PATTERN);

const BUCKET = new RegExp(BACKUP_BUCKET_PATTERN);

const REGION = new RegExp(BACKUP_REGION_PATTERN);

function problemOf(
  value: string,
  valid: RegExp | null,
  refusal: BackupFieldProblem
): BackupFieldProblem | null {
  if (value.trim() === "") {
    return "required";
  }

  return !valid || valid.test(value.trim()) ? null : refusal;
}

function endpointProblem(value: string): BackupFieldProblem | null {
  return value.trim().startsWith("http://")
    ? "http"
    : problemOf(value, ENDPOINT, "endpoint");
}

/**
 * What the bucket fields get wrong, by the rules the agent and the platform
 * read them with. The form shows these under the fields; the main process
 * refuses on the same ones.
 */
export function backupStorageProblems(
  storage: BackupStorage
): Partial<Record<keyof BackupStorage, BackupFieldProblem>> {
  const found: Partial<Record<keyof BackupStorage, BackupFieldProblem | null>> =
    {
      access_key_id: problemOf(storage.access_key_id, null, "required"),
      bucket: problemOf(storage.bucket, BUCKET, "bucket"),
      endpoint: endpointProblem(storage.endpoint),
      prefix: problemOf(storage.prefix, PREFIX_PATTERN, "prefix"),
      region: problemOf(storage.region, REGION, "region"),
    };

  return Object.fromEntries(
    Object.entries(found).filter(([, problem]) => problem !== null)
  ) as Partial<Record<keyof BackupStorage, BackupFieldProblem>>;
}

/** The data parts of a backup: everything `backup.restore.data` can bring back. */
export function dataParts(parts: readonly BackupPart[]): BackupPart[] {
  return parts.filter((part) => part.kind !== "setup");
}

/** What a restored machine owes the next steps: the parts to bring back once its modules stand. */
export interface RestoredSetup {
  backupId: string;
  parts: BackupPart[];
}

export function restoredSetupOf(
  result: BackupRestoreSetupResult
): RestoredSetup {
  return { backupId: result.id, parts: dataParts(result.parts) };
}
