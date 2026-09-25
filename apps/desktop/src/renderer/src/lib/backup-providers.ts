import {
  type BackupConnectionView,
  type BackupFieldProblem,
  type BackupStorage,
  backupStorageProblems,
} from "@shared/backups";

export const BACKUP_PROVIDERS = ["r2", "aws", "other"] as const;

export type BackupProvider = (typeof BACKUP_PROVIDERS)[number];

const R2_ENDPOINT = /^https:\/\/([^./]*)\.r2\.cloudflarestorage\.com\/?$/;

const AWS_ENDPOINT = /^https:\/\/s3[.-]([a-z0-9-]+)\.amazonaws\.com\/?$/;

const R2_ACCOUNT = /^[a-f0-9]{32}$/;

export function providerOf(endpoint: string): BackupProvider {
  const trimmed = endpoint.trim();

  if (trimmed === "" || R2_ENDPOINT.test(trimmed)) {
    return "r2";
  }

  return AWS_ENDPOINT.test(trimmed) ? "aws" : "other";
}

export function r2AccountOf(endpoint: string): string {
  return R2_ENDPOINT.exec(endpoint.trim())?.[1] ?? "";
}

/** Takes either an account ID or a pasted S3 API address. */
export function r2Endpoint(typed: string): string {
  const account = r2AccountOf(typed) || typed.trim().toLowerCase();

  return account ? `https://${account}.r2.cloudflarestorage.com` : "";
}

export function r2AccountValid(endpoint: string): boolean {
  return R2_ACCOUNT.test(r2AccountOf(endpoint));
}

export function awsEndpoint(region: string): string {
  const trimmed = region.trim();

  return trimmed ? `https://s3.${trimmed}.amazonaws.com` : "";
}

export function switchedTo(
  provider: BackupProvider,
  storage: BackupStorage
): BackupStorage {
  return provider === "aws"
    ? { ...storage, endpoint: "", path_style: false, region: "" }
    : { ...storage, endpoint: "", path_style: true, region: "auto" };
}

export type StorageProblem = BackupFieldProblem | "r2Account";

export function storageProblems(
  provider: BackupProvider,
  storage: BackupStorage
): Partial<Record<keyof BackupStorage, StorageProblem>> {
  const problems: Partial<Record<keyof BackupStorage, StorageProblem>> =
    backupStorageProblems(storage);

  if (
    provider === "r2" &&
    storage.endpoint !== "" &&
    !r2AccountValid(storage.endpoint)
  ) {
    problems.endpoint = "r2Account";
  }

  return problems;
}

const BLANK_STORAGE: BackupStorage = {
  access_key_id: "",
  bucket: "",
  endpoint: "",
  path_style: true,
  prefix: "pupitre",
  region: "auto",
};

export function storageOf(view: BackupConnectionView | null): BackupStorage {
  return view
    ? {
        access_key_id: view.access_key_id,
        bucket: view.bucket,
        endpoint: view.endpoint,
        path_style: view.path_style,
        prefix: view.prefix,
        region: view.region,
      }
    : BLANK_STORAGE;
}

const CONNECTION_KEYS = [
  "endpoint",
  "region",
  "bucket",
  "prefix",
  "path_style",
  "access_key_id",
  "recipient",
  "kdf_salt",
] as const;

export function driftsFrom(
  view: BackupConnectionView,
  values: Record<string, unknown>
): boolean {
  return CONNECTION_KEYS.some(
    (key) => values[key] !== undefined && values[key] !== view[key]
  );
}
