import type { BackupRestoreSetupResult } from "@pupitre/shared/agent-protocol/backup";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import {
  BACKUP_BUCKET_PATTERN,
  BACKUP_ENDPOINT_PATTERN,
  BACKUP_REGION_PATTERN,
  type BackupPart,
  type PlatformBackup as SharedPlatformBackup,
} from "@pupitre/shared/backup";

export interface BackupStorage {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  path_style: boolean;
  access_key_id: string;
}

/** Enough for a server to encrypt, never to decrypt. */
export interface BackupIdentity {
  recipient: string;
  kdf_salt: string;
}

export type BackupConnectionView = BackupStorage & BackupIdentity;

/** An omitted secret keeps the keychain's; an omitted passphrase keeps or adopts the organization's identity. */
export interface BackupConnectionInput extends BackupStorage {
  secret_access_key?: string;
  passphrase?: string;
}

export interface OrganizationIdentity extends BackupIdentity {
  created_at: string;
  server_name: string;
}

export type PlatformBackup = SharedPlatformBackup;

export type RestorePhase = "save" | "setup";

export type RestoreUpdate =
  | { kind: "phase"; phase: RestorePhase }
  | { kind: "event"; event: Event };

export interface RestoreSetupOptions {
  revert: boolean;
  saveFirst: boolean;
}

export const BACKUP_PASSPHRASE_MIN = 12;

export type BackupFieldProblem =
  | "required"
  | "http"
  | "endpoint"
  | "bucket"
  | "region"
  | "prefix";

/** Mirrors the `prefix` pattern of `core.backup`'s manifest. */
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

export function dataParts(parts: readonly BackupPart[]): BackupPart[] {
  return parts.filter((part) => part.kind !== "setup");
}

export interface RestoredSetup {
  backupId: string;
  parts: BackupPart[];
}

export function restoredSetupOf(
  result: BackupRestoreSetupResult
): RestoredSetup {
  return { backupId: result.id, parts: dataParts(result.parts) };
}
